//! Single-admin authentication for the SimAdmin web console.

use std::io::{self, Write};
use std::num::NonZeroU32;

use anyhow::{bail, Result};
use axum::{
    extract::State,
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ring::{
    digest, pbkdf2,
    rand::{SecureRandom, SystemRandom},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{db::Database, models::ApiResponse, state::AppState};

const PASSWORD_KEY: &str = "admin_password_hash";
const PASSWORD_ALGORITHM: &str = "pbkdf2_sha256";
const PBKDF2_ITERATIONS: u32 = 210_000;
const PASSWORD_SALT_LEN: usize = 16;
const PASSWORD_HASH_LEN: usize = 32;
const SESSION_TOKEN_LEN: usize = 32;
const SESSION_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;
const SESSION_COOKIE: &str = "simadmin_session";

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthStatusResponse {
    pub configured: bool,
    pub authenticated: bool,
}

#[derive(Debug)]
struct SessionToken {
    token: String,
    hash: String,
}

pub fn validate_admin_password(password: &str) -> Result<()> {
    if !(8..=64).contains(&password.len()) {
        bail!("密码长度需为 8-64 个字符");
    }
    if !password.bytes().all(|byte| byte.is_ascii_graphic()) {
        bail!("密码只能包含英文字母、数字和符号");
    }

    let categories = [
        password.bytes().any(|byte| byte.is_ascii_lowercase()),
        password.bytes().any(|byte| byte.is_ascii_uppercase()),
        password.bytes().any(|byte| byte.is_ascii_digit()),
        password
            .bytes()
            .any(|byte| byte.is_ascii_graphic() && !byte.is_ascii_alphanumeric()),
    ]
    .into_iter()
    .filter(|matched| *matched)
    .count();

    if categories < 2 {
        bail!("密码至少需要包含两类字符");
    }
    Ok(())
}

pub fn hash_password(password: &str) -> Result<String> {
    validate_admin_password(password)?;

    let rng = SystemRandom::new();
    let mut salt = [0u8; PASSWORD_SALT_LEN];
    rng.fill(&mut salt)
        .map_err(|_| anyhow::anyhow!("Failed to generate password salt"))?;

    let mut output = [0u8; PASSWORD_HASH_LEN];
    let iterations = NonZeroU32::new(PBKDF2_ITERATIONS).expect("non-zero iterations");
    pbkdf2::derive(
        pbkdf2::PBKDF2_HMAC_SHA256,
        iterations,
        &salt,
        password.as_bytes(),
        &mut output,
    );

    Ok(format!(
        "{}${}${}${}",
        PASSWORD_ALGORITHM,
        PBKDF2_ITERATIONS,
        URL_SAFE_NO_PAD.encode(salt),
        URL_SAFE_NO_PAD.encode(output)
    ))
}

fn verify_password(password: &str, encoded_hash: &str) -> Result<bool> {
    let parts: Vec<&str> = encoded_hash.split('$').collect();
    if parts.len() != 4 || parts[0] != PASSWORD_ALGORITHM {
        bail!("Unsupported password hash format");
    }

    let iterations = parts[1].parse::<u32>()?;
    let iterations = NonZeroU32::new(iterations).ok_or_else(|| anyhow::anyhow!("Invalid hash"))?;
    let salt = URL_SAFE_NO_PAD.decode(parts[2])?;
    let expected = URL_SAFE_NO_PAD.decode(parts[3])?;

    Ok(pbkdf2::verify(
        pbkdf2::PBKDF2_HMAC_SHA256,
        iterations,
        &salt,
        password.as_bytes(),
        &expected,
    )
    .is_ok())
}

fn generate_session_token() -> Result<SessionToken> {
    let rng = SystemRandom::new();
    let mut raw = [0u8; SESSION_TOKEN_LEN];
    rng.fill(&mut raw)
        .map_err(|_| anyhow::anyhow!("Failed to generate session token"))?;
    let token = URL_SAFE_NO_PAD.encode(raw);
    let hash = hash_session_token(&token);
    Ok(SessionToken { token, hash })
}

fn hash_session_token(token: &str) -> String {
    URL_SAFE_NO_PAD.encode(digest::digest(&digest::SHA256, token.as_bytes()).as_ref())
}

fn session_cookie(token: &str) -> String {
    format!(
        "{SESSION_COOKIE}={token}; HttpOnly; SameSite=Lax; Path=/; Max-Age={SESSION_TTL_SECONDS}"
    )
}

fn cookie_token(headers: &HeaderMap) -> Option<String> {
    let cookie = headers.get(header::COOKIE)?.to_str().ok()?;
    cookie.split(';').find_map(|part| {
        let (name, value) = part.trim().split_once('=')?;
        (name == SESSION_COOKIE).then(|| value.to_string())
    })
}

fn wants_login_redirect(headers: &HeaderMap) -> bool {
    let accepts_html = headers
        .get(header::ACCEPT)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.contains("text/html"))
        .unwrap_or(false);
    let is_navigation = headers
        .get("sec-fetch-mode")
        .and_then(|value| value.to_str().ok())
        .map(|value| value.eq_ignore_ascii_case("navigate"))
        .unwrap_or(false);
    accepts_html || is_navigation
}

fn unauthorized_response(headers: &HeaderMap, message: impl Into<String>) -> Response {
    if wants_login_redirect(headers) {
        return (StatusCode::SEE_OTHER, [(header::LOCATION, "/login")]).into_response();
    }

    (
        StatusCode::UNAUTHORIZED,
        Json(ApiResponse::<Value>::error(message.into())),
    )
        .into_response()
}

fn response_with_session<T: Serialize>(payload: ApiResponse<T>, token: &str) -> Response {
    let mut response = Json(payload).into_response();
    let cookie = session_cookie(token);
    if let Ok(value) = HeaderValue::from_str(&cookie) {
        response.headers_mut().insert(header::SET_COOKIE, value);
    }
    response
}

fn is_authenticated(database: &Database, headers: &HeaderMap) -> bool {
    let Some(token) = cookie_token(headers) else {
        return false;
    };
    database
        .auth_session_valid(&hash_session_token(&token))
        .unwrap_or(false)
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    headers: HeaderMap,
    request: axum::extract::Request,
    next: Next,
) -> Response {
    if request.method() == Method::OPTIONS {
        return next.run(request).await;
    }

    if !state.database.auth_is_configured().unwrap_or(false) {
        return unauthorized_response(&headers, "管理员密码尚未设置");
    }

    if !is_authenticated(&state.database, &headers) {
        return unauthorized_response(&headers, "请先登录");
    }

    next.run(request).await
}

pub async fn status(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> (StatusCode, Json<ApiResponse<AuthStatusResponse>>) {
    let configured = state.database.auth_is_configured().unwrap_or(false);
    let authenticated = configured && is_authenticated(&state.database, &headers);
    (
        StatusCode::OK,
        Json(ApiResponse::success_with_message(
            "Success",
            AuthStatusResponse {
                configured,
                authenticated,
            },
        )),
    )
}

pub async fn setup(State(state): State<AppState>, Json(payload): Json<LoginRequest>) -> Response {
    if state.database.auth_is_configured().unwrap_or(false) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<Value>::error("管理员密码已设置")),
        )
            .into_response();
    }

    let password_hash = match hash_password(&payload.password) {
        Ok(hash) => hash,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<Value>::error(err.to_string())),
            )
                .into_response()
        }
    };

    if let Err(err) = state
        .database
        .set_auth_config_value(PASSWORD_KEY, &password_hash)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Value>::error(format!(
                "保存管理员密码失败: {err}"
            ))),
        )
            .into_response();
    }

    let session = match generate_session_token() {
        Ok(session) => session,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Value>::error(err.to_string())),
            )
                .into_response()
        }
    };

    if let Err(err) = state
        .database
        .insert_auth_session(&session.hash, SESSION_TTL_SECONDS)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Value>::error(format!("创建会话失败: {err}"))),
        )
            .into_response();
    }

    response_with_session(
        ApiResponse::success_with_message("Admin password configured", Value::Null),
        &session.token,
    )
}

pub async fn login(State(state): State<AppState>, Json(payload): Json<LoginRequest>) -> Response {
    let Some(password_hash) = state
        .database
        .get_auth_config_value(PASSWORD_KEY)
        .unwrap_or(None)
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<Value>::error("管理员密码尚未设置")),
        )
            .into_response();
    };

    match verify_password(&payload.password, &password_hash) {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<Value>::error("管理员密码不正确")),
            )
                .into_response()
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Value>::error(format!("验证密码失败: {err}"))),
            )
                .into_response()
        }
    }

    let session = match generate_session_token() {
        Ok(session) => session,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Value>::error(err.to_string())),
            )
                .into_response()
        }
    };

    if let Err(err) = state
        .database
        .insert_auth_session(&session.hash, SESSION_TTL_SECONDS)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Value>::error(format!("创建会话失败: {err}"))),
        )
            .into_response();
    }

    response_with_session(
        ApiResponse::success_with_message("Logged in", Value::Null),
        &session.token,
    )
}

pub async fn change_password(
    State(state): State<AppState>,
    Json(payload): Json<ChangePasswordRequest>,
) -> Response {
    let Some(password_hash) = state
        .database
        .get_auth_config_value(PASSWORD_KEY)
        .unwrap_or(None)
    else {
        return (
            StatusCode::BAD_REQUEST,
            Json(ApiResponse::<Value>::error("管理员密码尚未设置")),
        )
            .into_response();
    };

    match verify_password(&payload.current_password, &password_hash) {
        Ok(true) => {}
        Ok(false) => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(ApiResponse::<Value>::error("当前密码不正确")),
            )
                .into_response()
        }
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Value>::error(format!("验证密码失败: {err}"))),
            )
                .into_response()
        }
    }

    let new_hash = match hash_password(&payload.new_password) {
        Ok(hash) => hash,
        Err(err) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ApiResponse::<Value>::error(err.to_string())),
            )
                .into_response()
        }
    };

    if let Err(err) = state.database.replace_admin_password_hash(&new_hash) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Value>::error(format!("更新密码失败: {err}"))),
        )
            .into_response();
    }

    let session = match generate_session_token() {
        Ok(session) => session,
        Err(err) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ApiResponse::<Value>::error(err.to_string())),
            )
                .into_response()
        }
    };

    if let Err(err) = state
        .database
        .insert_auth_session(&session.hash, SESSION_TTL_SECONDS)
    {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ApiResponse::<Value>::error(format!("创建会话失败: {err}"))),
        )
            .into_response();
    }

    response_with_session(
        ApiResponse::success_with_message("Password updated", Value::Null),
        &session.token,
    )
}

pub fn reset_admin_password_interactive(database: &Database) -> Result<()> {
    let password = read_password_line("New admin password: ")?;
    let confirm = read_password_line("Confirm admin password: ")?;
    if password != confirm {
        bail!("Passwords do not match");
    }
    let hash = hash_password(&password)?;
    database.replace_admin_password_hash(&hash)?;
    println!("Admin password updated and all web sessions were cleared.");
    Ok(())
}

pub fn clear_admin_auth(database: &Database) -> Result<()> {
    database.clear_admin_auth()?;
    println!("Admin password and all web sessions were cleared.");
    println!("Open the web UI to set a new admin password.");
    Ok(())
}

#[cfg(unix)]
fn read_password_line(prompt: &str) -> Result<String> {
    print!("{prompt}");
    io::stdout().flush()?;
    let _ = std::process::Command::new("stty").arg("-echo").status();
    let mut value = String::new();
    let result = io::stdin().read_line(&mut value);
    let _ = std::process::Command::new("stty").arg("echo").status();
    println!();
    result?;
    Ok(value.trim_end_matches(['\r', '\n']).to_string())
}

#[cfg(not(unix))]
fn read_password_line(prompt: &str) -> Result<String> {
    print!("{prompt}");
    io::stdout().flush()?;
    let mut value = String::new();
    io::stdin().read_line(&mut value)?;
    Ok(value.trim_end_matches(['\r', '\n']).to_string())
}
