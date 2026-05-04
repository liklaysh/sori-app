use base64::Engine;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, COOKIE, SET_COOKIE};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::process::Command;
use std::sync::Mutex;
use tauri::State;

struct DesktopHttpState {
    client: reqwest::Client,
    session_token: Mutex<Option<String>>,
}

impl DesktopHttpState {
    fn new() -> Self {
        let client = reqwest::Client::builder()
            .cookie_store(true)
            .user_agent("SORI App")
            .build()
            .expect("failed to create SORI desktop HTTP client");

        Self {
            client,
            session_token: Mutex::new(None),
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopHttpRequest {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUploadRequest {
    url: String,
    headers: HashMap<String, String>,
    fields: Vec<DesktopUploadField>,
    files: Vec<DesktopUploadFile>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUploadField {
    name: String,
    value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopUploadFile {
    name: String,
    file_name: String,
    mime_type: String,
    data_base64: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopHttpResponse {
    status: u16,
    body: String,
}

fn apply_headers(
    mut request: reqwest::RequestBuilder,
    headers: &HashMap<String, String>,
) -> reqwest::RequestBuilder {
    let mut header_map = HeaderMap::new();

    for (name, value) in headers {
        let lower_name = name.to_ascii_lowercase();
        if matches!(
            lower_name.as_str(),
            "host" | "origin" | "referer" | "cookie" | "content-length"
        ) {
            continue;
        }

        if let (Ok(header_name), Ok(header_value)) = (
            HeaderName::from_bytes(name.as_bytes()),
            HeaderValue::from_str(value),
        ) {
            header_map.insert(header_name, header_value);
        }
    }

    request = request.headers(header_map);
    request
}

fn apply_session_cookie(
    request: reqwest::RequestBuilder,
    state: &DesktopHttpState,
) -> reqwest::RequestBuilder {
    let session_token = state
        .session_token
        .lock()
        .expect("failed to lock SORI desktop session token")
        .clone();

    if let Some(token) = session_token.filter(|token| !token.is_empty()) {
        request.header(COOKIE, format!("sori_auth={token}"))
    } else {
        request
    }
}

fn remember_session_cookie(state: &DesktopHttpState, headers: &HeaderMap) {
    for value in headers.get_all(SET_COOKIE).iter() {
        let Ok(cookie) = value.to_str() else {
            continue;
        };

        let Some(raw_token) = cookie
            .split(';')
            .next()
            .and_then(|part| part.strip_prefix("sori_auth="))
        else {
            continue;
        };

        let mut session_token = state
            .session_token
            .lock()
            .expect("failed to lock SORI desktop session token");

        if raw_token.is_empty() {
            *session_token = None;
        } else {
            *session_token = Some(raw_token.to_string());
        }
    }
}

async fn parse_response(
    state: &DesktopHttpState,
    response: reqwest::Response,
) -> Result<DesktopHttpResponse, String> {
    let status = response.status().as_u16();
    remember_session_cookie(state, response.headers());
    let body = response.text().await.map_err(|error| error.to_string())?;

    Ok(DesktopHttpResponse { status, body })
}

#[tauri::command]
async fn desktop_http_request(
    state: State<'_, DesktopHttpState>,
    request: DesktopHttpRequest,
) -> Result<DesktopHttpResponse, String> {
    let method = request
        .method
        .parse::<reqwest::Method>()
        .map_err(|error| error.to_string())?;

    let builder = state.client.request(method, request.url);
    let builder = apply_headers(builder, &request.headers);
    let builder = apply_session_cookie(builder, &state);
    let builder = match request.body {
        Some(body) => builder.body(body),
        None => builder,
    };

    let response = builder.send().await.map_err(|error| error.to_string())?;
    parse_response(&state, response).await
}

#[tauri::command]
async fn desktop_http_upload(
    state: State<'_, DesktopHttpState>,
    request: DesktopUploadRequest,
) -> Result<DesktopHttpResponse, String> {
    let mut form = reqwest::multipart::Form::new();

    for field in request.fields {
        form = form.text(field.name, field.value);
    }

    for file in request.files {
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(file.data_base64)
            .map_err(|error| error.to_string())?;

        let part = reqwest::multipart::Part::bytes(bytes)
            .file_name(file.file_name)
            .mime_str(&file.mime_type)
            .map_err(|error| error.to_string())?;

        form = form.part(file.name, part);
    }

    let builder = state.client.post(request.url).multipart(form);
    let builder = apply_headers(builder, &request.headers);
    let builder = apply_session_cookie(builder, &state);
    let response = builder.send().await.map_err(|error| error.to_string())?;
    parse_response(&state, response).await
}

#[tauri::command]
fn desktop_http_session_token(state: State<'_, DesktopHttpState>) -> Option<String> {
    state
        .session_token
        .lock()
        .expect("failed to lock SORI desktop session token")
        .clone()
}

#[tauri::command]
fn desktop_http_clear_session(state: State<'_, DesktopHttpState>) {
    let mut session_token = state
        .session_token
        .lock()
        .expect("failed to lock SORI desktop session token");
    *session_token = None;
}

#[tauri::command]
fn desktop_http_set_session_token(state: State<'_, DesktopHttpState>, token: Option<String>) {
    let mut session_token = state
        .session_token
        .lock()
        .expect("failed to lock SORI desktop session token");
    *session_token = token.filter(|value| !value.is_empty());
}

#[tauri::command]
fn desktop_open_external_url(url: String) -> Result<(), String> {
    let lower_url = url.to_ascii_lowercase();
    if !lower_url.starts_with("https://")
        && !lower_url.starts_with("http://")
        && !lower_url.starts_with("mailto:")
    {
        return Err("Unsupported URL scheme".to_string());
    }

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(&url).status();

    #[cfg(target_os = "windows")]
    let status = Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &url])
        .status();

    #[cfg(all(unix, not(target_os = "macos")))]
    let status = Command::new("xdg-open").arg(&url).status();

    status
        .map_err(|error| error.to_string())
        .and_then(|status| {
            if status.success() {
                Ok(())
            } else {
                Err(format!("Failed to open URL: {status}"))
            }
        })
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DesktopHttpState::new())
        .invoke_handler(tauri::generate_handler![
            desktop_http_request,
            desktop_http_upload,
            desktop_http_session_token,
            desktop_http_set_session_token,
            desktop_http_clear_session,
            desktop_open_external_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running SORI App");
}
