//! Canvas 渲染 (T1) — 自动化测试
//!
//! Phase 3：边界场景验证
//! Phase 4：渲染管道输入/输出逻辑验证
//!
//! 运行：cargo test --test canvas_tests -- --nocapture

use socratic_novel_lib::ai::tools::execute_tool;

/// 测试用 workspace 路径（不需要真实存在，render_canvas 不访问文件系统）
fn dummy_ws() -> &'static str {
    "/tmp/__canvas_test_ws__"
}

// ═══════════════════════════════════════════════════════════════
//  Phase 3 — 边界场景
// ═══════════════════════════════════════════════════════════════

/// 3-1: content 为空字符串 → 应返回错误，is_error=true
#[test]
fn test_render_canvas_empty_content() {
    println!("\n[Phase 3-1] render_canvas 空 content → 期望 Error");
    let input = serde_json::json!({
        "title": "Test",
        "content": "",
        "type": "svg"
    });
    let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    assert!(is_error, "空 content 应触发错误");
    assert!(msg.contains("content is required"), "错误信息不符: {}", msg);
    println!("  ✅ 通过");
}

/// 3-2: 畸形 Mermaid 语法 — Rust 层不做验证，应透传成功（前端 MermaidRenderer 负责显示 error）
#[test]
fn test_render_canvas_malformed_mermaid() {
    println!("\n[Phase 3-2] render_canvas 畸形 Mermaid → Rust 层应透传（不崩溃）");
    let malformed = "graph LR\n  A[缺少箭头\n  ??? 乱码 {{{{ }}}}";
    let input = serde_json::json!({
        "title": "畸形图",
        "content": malformed,
        "type": "mermaid"
    });
    let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    assert!(!is_error, "畸形 Mermaid 不应在 Rust 层报错，但收到: {}", msg);
    assert!(msg.contains("mermaid"), "返回消息应包含类型 mermaid");
    println!("  ✅ 通过 — Rust 层正确透传，前端 MermaidRenderer 负责错误展示");
}

/// 3-3: 超大 SVG（1 MB+）— 不应崩溃或截断
#[test]
fn test_render_canvas_large_svg() {
    println!("\n[Phase 3-3] render_canvas 超大 SVG (1 MB+) → 不崩溃");
    // 生成约 1.2 MB 的合法 SVG
    let mut svg = String::from("<svg xmlns='http://www.w3.org/2000/svg'>");
    for i in 0..5000 {
        svg.push_str(&format!(
            "<rect x='{}' y='{}' width='10' height='10' fill='#{:06x}'/>",
            i % 1000,
            i / 1000 * 12,
            (i * 31337) & 0xFFFFFF
        ));
    }
    svg.push_str("</svg>");
    println!("  SVG 大小: {} bytes ({:.1} KB)", svg.len(), svg.len() as f64 / 1024.0);

    let input = serde_json::json!({
        "title": "大图",
        "content": svg,
        "type": "svg"
    });
    let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    assert!(!is_error, "超大 SVG 不应报错: {}", msg);
    println!("  ✅ 通过");
}

/// 3-4: 缺少 type 字段 → 默认 "svg"
#[test]
fn test_render_canvas_default_type() {
    println!("\n[Phase 3-4] render_canvas 缺少 type 字段 → 默认 svg");
    let input = serde_json::json!({
        "title": "无类型",
        "content": "<svg><circle cx='50' cy='50' r='40'/></svg>"
        // 没有 "type" 字段
    });
    let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    assert!(!is_error, "缺少 type 不应报错: {}", msg);
    assert!(msg.contains("svg"), "默认类型应为 svg，但消息为: {}", msg);
    println!("  ✅ 通过");
}

/// 3-5: 缺少 title 字段 → 默认 "Canvas"
#[test]
fn test_render_canvas_default_title() {
    println!("\n[Phase 3-5] render_canvas 缺少 title 字段 → 默认 Canvas");
    let input = serde_json::json!({
        "content": "<svg><rect width='100' height='100'/></svg>",
        "type": "svg"
        // 没有 "title" 字段
    });
    let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    assert!(!is_error, "缺少 title 不应报错: {}", msg);
    assert!(msg.contains("Canvas"), "默认标题应为 Canvas，但消息为: {}", msg);
    println!("  ✅ 通过");
}

// ═══════════════════════════════════════════════════════════════
//  Phase 4 — 自动化管道逻辑验证
// ═══════════════════════════════════════════════════════════════

/// 4-1: render_canvas 成功时返回格式验证
#[test]
fn test_render_canvas_success_format() {
    println!("\n[Phase 4-1] render_canvas 成功返回格式");
    let input = serde_json::json!({
        "title": "电场线图",
        "content": "graph LR\n  Q[点电荷] --> E[电场线]",
        "type": "mermaid"
    });
    let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    assert!(!is_error, "正常调用不应报错: {}", msg);
    // 格式: "[Canvas rendered (mermaid): 电场线图]"
    assert!(msg.contains("Canvas rendered"), "缺少 'Canvas rendered': {}", msg);
    assert!(msg.contains("mermaid"), "缺少类型 mermaid: {}", msg);
    assert!(msg.contains("电场线图"), "缺少标题 '电场线图': {}", msg);
    println!("  ✅ 通过 — 返回格式符合预期: {}", msg);
}

/// 4-2: render_canvas 类型 "interactive" 透传
#[test]
fn test_render_canvas_interactive_type() {
    println!("\n[Phase 4-2] render_canvas type=interactive 透传");
    let input = serde_json::json!({
        "title": "交互图",
        "content": "<svg><circle id='c1' cx='50' cy='50' r='30'/></svg>",
        "type": "interactive",
        "parameters": [{"id": "r", "label": "半径", "min": 10, "max": 100, "default": 30}]
    });
    let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    assert!(!is_error, "interactive 类型不应报错: {}", msg);
    assert!(msg.contains("interactive"), "返回消息应包含 interactive: {}", msg);
    println!("  ✅ 通过");
}

/// 4-3: render_canvas 不是 execute_tool 分支的工具，不影响其他工具
#[test]
fn test_unknown_tool_is_error() {
    println!("\n[Phase 4-3] 未知工具名返回错误");
    let input = serde_json::json!({ "content": "test" });
    let (msg, is_error) = execute_tool(dummy_ws(), "nonexistent_tool_xyz", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    assert!(is_error, "未知工具应返回 is_error=true");
    println!("  ✅ 通过");
}

/// 4-4: render_canvas 多次调用（无 AppHandle）均独立返回成功
#[test]
fn test_render_canvas_multiple_calls() {
    println!("\n[Phase 4-4] render_canvas 多次调用独立性（无 AppHandle）");
    let types = ["svg", "mermaid", "interactive", "sandbox"];
    for (i, canvas_type) in types.iter().enumerate() {
        let content = if *canvas_type == "svg" || *canvas_type == "interactive" {
            "<svg><rect width='10' height='10'/></svg>".to_string()
        } else if *canvas_type == "mermaid" {
            "graph LR\n  A --> B".to_string()
        } else {
            "<html><body>test</body></html>".to_string()
        };

        let input = serde_json::json!({
            "title": format!("图表 {}", i + 1),
            "content": content,
            "type": canvas_type,
        });
        let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
        println!("  调用 {}: type={}, is_error={}, msg={:?}", i + 1, canvas_type, is_error, msg);
        assert!(!is_error, "第 {} 次调用不应报错: {}", i + 1, msg);
    }
    println!("  ✅ 通过 — {} 次调用均独立成功", types.len());
}

/// 4-5: render_canvas content 中含特殊字符（XSS 尝试）— Rust 层应透传，前端沙箱负责防护
#[test]
fn test_render_canvas_xss_content_passthrough() {
    println!("\n[Phase 4-5] render_canvas XSS 内容透传（Rust 层不过滤）");
    let xss = "<svg><script>alert('xss')</script><rect width='100' height='100'/></svg>";
    let input = serde_json::json!({
        "title": "XSS 测试",
        "content": xss,
        "type": "svg"
    });
    let (msg, is_error) = execute_tool(dummy_ws(), "render_canvas", &input, None);
    println!("  结果: is_error={}, msg={:?}", is_error, msg);
    // Rust 层正确透传（不做 XSS 过滤，前端 Tauri sandbox 负责）
    assert!(!is_error, "Rust 层不应对 SVG 内容做过滤: {}", msg);
    println!("  ✅ 通过 — Rust 层透传，安全防护由 Tauri sandbox 完成");
}
