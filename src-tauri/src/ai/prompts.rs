pub struct PromptBuilder;

impl PromptBuilder {
    pub fn build_narrative_summary_prompt(
        title: &str,
        genres: &[String],
        synopsis: &str,
        user_notes: Option<&str>,
        custom_focus: Option<&str>,
    ) -> String {
        let genre_str = if genres.is_empty() { "Cinematic Narrative".to_string() } else { genres.join(", ") };
        let focus_str = custom_focus.unwrap_or("thematic subtext, character transformation, and emotional stakes");
        let notes_str = user_notes.unwrap_or("None provided.");

        format!(
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\
            You are CineVault AI, an elite narrative analyst and cinematic story consultant. \
            Analyze the provided film or story and generate a rich, engaging, 3-paragraph synthesis focusing on {}.\n\
            Format your response in clean Markdown with subtle section headings.\n\
            <|eot_id|><|start_header_id|>user<|end_header_id|>\n\
            Title: {}\n\
            Genres: {}\n\
            Official Synopsis: {}\n\
            Creator / User Notes: {}\n\n\
            Please provide your narrative synthesis:\n\
            <|eot_id|><|start_header_id|>assistant<|end_header_id|>\n",
            focus_str, title, genre_str, synopsis, notes_str
        )
    }

    pub fn build_lore_continuity_audit_prompt(
        character_backstory: &str,
        established_rules: &str,
        scene_action: &str,
    ) -> String {
        format!(
            "<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\
            You are CineVault Lore Continuity Engine. Audit the following scene action against the established character backstory and world rules. \
            Pinpoint any plot holes, logical inconsistencies, or character motivation contradictions.\n\
            <|eot_id|><|start_header_id|>user<|end_header_id|>\n\
            Character Motivation & Backstory: {}\n\
            World Rules & Continuity: {}\n\
            Proposed Scene Action: {}\n\n\
            Audit Report (Identify any contradictions):\n\
            <|eot_id|><|start_header_id|>assistant<|end_header_id|>\n",
            character_backstory, established_rules, scene_action
        )
    }
}
