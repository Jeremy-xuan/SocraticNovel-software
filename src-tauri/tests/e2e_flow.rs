//! SocraticNovel 端到端集成测试
//! 模拟完整用户流程：创建workspace → 写文件 → 读文件 → 复习卡片 → 导出 → 清理
//!
//! 运行：cargo test --test e2e_flow -- --nocapture

// Re-use library code directly
use socratic_novel_lib::commands::fs_commands;
use socratic_novel_lib::commands::review_commands;

fn test_workspace_path() -> String {
    let home = dirs::home_dir().expect("home dir");
    home.join("socratic-novel-软件开发")
        .join("workspaces")
        .join("__e2e_test__")
        .to_string_lossy()
        .to_string()
}

#[test]
fn test_full_user_flow() {
    println!("\n═══════════════════════════════════════════════");
    println!("  SocraticNovel 端到端集成测试");
    println!("═══════════════════════════════════════════════\n");

    // ── Step 1: List existing workspaces ──
    println!("📋 Step 1: 列出现有 workspace");
    let workspaces = fs_commands::list_workspaces().expect("list_workspaces failed");
    println!("  ✅ 找到 {} 个 workspace", workspaces.len());
    for ws in &workspaces {
        println!("    📁 {} ({})", ws.id, ws.path);
    }

    // ── Step 2: Create test workspace ──
    println!("\n📋 Step 2: 创建测试 workspace");
    // Clean up from any previous test
    let _ = fs_commands::delete_workspace("__e2e_test__");

    let ws = fs_commands::create_workspace("__e2e_test__").expect("create_workspace failed");
    println!("  ✅ 创建成功: {} ({})", ws.id, ws.path);
    assert_eq!(ws.id, "__e2e_test__");

    let ws_path = ws.path.clone();

    // ── Step 3: Write files (simulating AI agent) ──
    println!("\n📋 Step 3: 写入教学文件 (模拟 AI Agent)");

    let system_core = "# 教学系统核心配置\n\n## 三铁律\n1. 只问不说\n2. 眼睛看学生\n3. 答案是学生的\n";
    fs_commands::write_file(&ws_path, "teacher/config/system_core.md", system_core)
        .expect("write system_core failed");
    println!("  ✅ teacher/config/system_core.md");

    let curriculum = "# 课程大纲\n\n## 第1章：牛顿运动定律\n- 1.1 惯性\n- 1.2 F=ma\n- 1.3 作用与反作用\n\n## 第2章：能量\n- 2.1 动能\n- 2.2 势能\n";
    fs_commands::write_file(&ws_path, "teacher/config/curriculum.md", curriculum)
        .expect("write curriculum failed");
    println!("  ✅ teacher/config/curriculum.md");

    let progress = "# 学习进度\n\n当前章节: 1.1 惯性\n完成度: 30%\n";
    fs_commands::write_file(&ws_path, "teacher/runtime/progress.md", progress)
        .expect("write progress failed");
    println!("  ✅ teacher/runtime/progress.md");

    let teaching_log = "# 教学日志\n\n## 2026-03-25\n学生表现出对惯性概念的初步理解。\n";
    fs_commands::write_file(&ws_path, "teacher/runtime/teaching_log.md", teaching_log)
        .expect("write teaching_log failed");
    println!("  ✅ teacher/runtime/teaching_log.md");

    // ── Step 4: Read files back (simulating frontend) ──
    println!("\n📋 Step 4: 读取文件 (模拟前端加载)");

    let read_core = fs_commands::read_file(&ws_path, "teacher/config/system_core.md")
        .expect("read system_core failed");
    assert!(read_core.contains("三铁律"));
    println!("  ✅ system_core.md: {} bytes, 包含三铁律", read_core.len());

    let read_curriculum = fs_commands::read_file(&ws_path, "teacher/config/curriculum.md")
        .expect("read curriculum failed");
    assert!(read_curriculum.contains("牛顿运动定律"));
    println!("  ✅ curriculum.md: {} bytes, 包含牛顿运动定律", read_curriculum.len());

    // ── Step 5: Append to file (simulating AI writing log) ──
    println!("\n📋 Step 5: 追加文件 (模拟 AI 写入日志)");
    let append_content = "\n## 2026-03-26\n继续探讨惯性的日常案例。学生提出了公交车急刹车的例子。\n";
    fs_commands::append_file(&ws_path, "teacher/runtime/teaching_log.md", append_content)
        .expect("append_file failed");
    let updated_log = fs_commands::read_file(&ws_path, "teacher/runtime/teaching_log.md")
        .expect("read updated log failed");
    assert!(updated_log.contains("公交车急刹车"));
    println!("  ✅ 追加成功, 日志 {} bytes", updated_log.len());

    // ── Step 6: List files (simulating AI scanning workspace) ──
    println!("\n📋 Step 6: 列出文件 (模拟 AI 扫描 workspace)");
    let files = fs_commands::list_files(&ws_path, "teacher")
        .expect("list_files failed");
    println!("  ✅ teacher/ 下 {} 个条目:", files.len());
    for f in &files {
        println!("    {} {}", if f.is_dir { "📁" } else { "📄" }, f.name);
    }

    // ── Step 7: Search file (simulating AI finding content) ──
    println!("\n📋 Step 7: 搜索文件内容 (模拟 AI search_file 工具)");
    let search_result = fs_commands::search_file(&ws_path, "teacher/config/curriculum.md", "能量")
        .expect("search_file failed");
    assert!(search_result.contains("能量"));
    println!("  ✅ 搜索 '能量': 找到匹配\n    {}", search_result.lines().next().unwrap_or(""));

    // ── Step 8: Add review cards (simulating Post Agent auto-generation) ──
    println!("\n📋 Step 8: 添加复习卡片 (模拟 Post Agent 自动生成)");
    let new_cards = vec![
        review_commands::NewCard {
            knowledge_point: "牛顿第一定律".to_string(),
            source_chapter: "1.1 惯性".to_string(),
            card_type: "concept".to_string(),
            front: "什么是惯性？为什么物体会保持运动状态不变？".to_string(),
            back: "惯性是物体保持当前运动状态的性质。没有外力时，静止物体保持静止，运动物体保持匀速直线运动。".to_string(),
        },
        review_commands::NewCard {
            knowledge_point: "牛顿第二定律".to_string(),
            source_chapter: "1.2 F=ma".to_string(),
            card_type: "compute".to_string(),
            front: "一个质量为 5kg 的物体受到 20N 的力，加速度是多少？".to_string(),
            back: "a = F/m = 20N / 5kg = 4 m/s²".to_string(),
        },
        review_commands::NewCard {
            knowledge_point: "动量守恒".to_string(),
            source_chapter: "1.3 作用与反作用".to_string(),
            card_type: "concept".to_string(),
            front: "为什么火箭能在真空中加速？".to_string(),
            back: "根据牛顿第三定律，火箭向后喷出气体（作用力），气体对火箭施加向前的反作用力，推动火箭前进。".to_string(),
        },
    ];

    let added = review_commands::add_review_cards_internal(&ws_path, new_cards)
        .expect("add_review_cards failed");
    assert_eq!(added, 3);
    println!("  ✅ 添加 {} 张复习卡片", added);

    // ── Step 9: Get review queue & stats ──
    println!("\n📋 Step 9: 获取复习队列和统计");
    let queue = review_commands::get_review_queue(ws_path.clone())
        .expect("get_review_queue failed");
    println!("  ✅ 队列中 {} 张卡片", queue.len());
    assert_eq!(queue.len(), 3);

    let stats = review_commands::get_review_stats(ws_path.clone())
        .expect("get_review_stats failed");
    println!("  ✅ 统计: total={}, due_today={}, mastered={}", 
             stats.total_cards, stats.due_today, stats.mastered);

    // ── Step 10: Review a card (simulating user study) ──
    println!("\n📋 Step 10: 复习卡片 (模拟用户学习)");
    let due = review_commands::get_due_cards(ws_path.clone())
        .expect("get_due_cards failed");
    println!("  📝 今日到期: {} 张", due.len());

    if let Some(card) = due.first() {
        println!("  🎴 问题: {}", card.front);
        println!("  💡 答案: {}", card.back);

        let updated = review_commands::update_review_card(review_commands::UpdateCardPayload {
            workspace_path: ws_path.clone(),
            card_id: card.id.clone(),
            rating: 4, // easy
        }).expect("update_review_card failed");
        println!("  ✅ 评分: easy | 下次复习: {} | ease: {:.2}", 
                 updated.next_review_date, updated.ease_factor);
        assert!(updated.review_count > 0);
    }

    // ── Step 11: Sandbox security check ──
    println!("\n📋 Step 11: 安全沙箱测试");
    let escape_result = fs_commands::read_file(&ws_path, "../../../etc/passwd");
    assert!(escape_result.is_err());
    println!("  ✅ 路径逃逸 (../) 被正确拦截: {}", escape_result.unwrap_err());

    let escape_result2 = fs_commands::write_file(&ws_path, "../../evil.txt", "hack");
    assert!(escape_result2.is_err());
    println!("  ✅ 写入逃逸被正确拦截: {}", escape_result2.unwrap_err());

    // ── Step 12: Update workspace meta ──
    println!("\n📋 Step 12: 更新 workspace 元数据");
    fs_commands::update_workspace_meta("__e2e_test__")
        .expect("update_workspace_meta failed");
    println!("  ✅ last_opened 已更新");

    // ── Step 13: Verify workspace appears in list ──
    println!("\n📋 Step 13: 验证 workspace 出现在列表中");
    let all_ws = fs_commands::list_workspaces().expect("list_workspaces failed");
    let found = all_ws.iter().any(|w| w.id == "__e2e_test__");
    assert!(found);
    println!("  ✅ __e2e_test__ 出现在 workspace 列表中");

    // ── Step 14: Delete test workspace ──
    println!("\n📋 Step 14: 删除测试 workspace");
    fs_commands::delete_workspace("__e2e_test__")
        .expect("delete_workspace failed");
    println!("  ✅ 测试 workspace 已删除");

    // Verify deletion
    let after_delete = fs_commands::list_workspaces().expect("list_workspaces failed");
    let still_exists = after_delete.iter().any(|w| w.id == "__e2e_test__");
    assert!(!still_exists);
    println!("  ✅ 确认已从列表中移除");

    // ── Step 15: Protected workspace check ──
    println!("\n📋 Step 15: 内置 workspace 保护测试");
    let del_builtin = fs_commands::delete_workspace("ap-physics-em");
    assert!(del_builtin.is_err());
    println!("  ✅ 内置 workspace 删除被正确拦截: {}", del_builtin.unwrap_err());

    // ── Summary ──
    println!("\n═══════════════════════════════════════════════");
    println!("  🎉 所有 15 个测试步骤通过！");
    println!("═══════════════════════════════════════════════\n");
    println!("  覆盖范围:");
    println!("    ✅ Workspace 创建/列出/删除/保护");
    println!("    ✅ 文件 读/写/追加/列出/搜索");
    println!("    ✅ 复习卡片 添加/查询/统计/评分/SM-2");
    println!("    ✅ 安全沙箱 路径逃逸拦截");
    println!("    ✅ Workspace 元数据更新");
    println!();
    println!("  未覆盖 (需要 API Key):");
    println!("    ⏭️ AI 对话 (start_ai_session, send_teaching_message)");
    println!("    ⏭️ 课后笔记生成 (generate_lesson_notes)");
    println!("    ⏭️ Anki 卡片导出 (generate_anki_cards)");
    println!("    ⏭️ PDF 导入增强 (ai_enhance_text)");
}
