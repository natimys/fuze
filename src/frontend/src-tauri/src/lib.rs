use reqwest::cookie::{CookieStore, Jar};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::{Arc, OnceLock}};

struct ApiClient {
    client: reqwest::Client,
    cookies: Arc<Jar>,
}

fn api_client() -> &'static ApiClient {
    static CLIENT: OnceLock<ApiClient> = OnceLock::new();
    CLIENT.get_or_init(|| {
        let cookies = Arc::new(Jar::default());
        let client = reqwest::Client::builder()
            // Fuze instance addresses are user-selected endpoints. In particular,
            // loopback installations must not be routed through a Windows system
            // proxy, which commonly makes localhost appear unavailable.
            .no_proxy()
            .cookie_provider(cookies.clone())
            .build()
            .expect("failed to build native HTTP client");
        ApiClient { client, cookies }
    })
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ApiRequest {
    url: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}

#[derive(Serialize)]
struct ApiResponse {
    status: u16,
    headers: HashMap<String, String>,
    body: String,
}

#[tauri::command]
async fn api_request(request: ApiRequest) -> Result<ApiResponse, String> {
    let url = reqwest::Url::parse(&request.url).map_err(|error| error.to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("only HTTP and HTTPS API addresses are supported".into());
    }
    let method = reqwest::Method::from_bytes(request.method.as_bytes())
        .map_err(|error| error.to_string())?;
    let client = api_client();
    let mut builder = client.client.request(method, url.clone());
    for (name, value) in request.headers {
        builder = builder.header(name, value);
    }
    if let Some(cookie_header) = client.cookies.cookies(&url).and_then(|value| value.to_str().ok().map(str::to_owned)) {
        let csrf_name = if url.path().ends_with("/auth/refresh") { "csrf_refresh_token" } else { "csrf_access_token" };
        if let Some(csrf) = cookie_header.split(';').map(str::trim).find_map(|item| item.strip_prefix(&format!("{csrf_name}="))) {
            builder = builder.header("X-CSRF-TOKEN", csrf);
        }
    }
    if let Some(body) = request.body {
        builder = builder.body(body);
    }
    let response = builder.send().await.map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let headers = response.headers().iter().filter_map(|(name, value)| {
        value.to_str().ok().map(|value| (name.to_string(), value.to_string()))
    }).collect();
    let body = response.text().await.map_err(|error| error.to_string())?;
    Ok(ApiResponse { status, headers, body })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![api_request])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
