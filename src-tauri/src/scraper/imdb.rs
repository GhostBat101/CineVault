use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ScrapedMedia {
    pub imdb_id: String,
    pub title: String,
    pub original_title: Option<String>,
    pub year: Option<i32>,
    pub runtime_minutes: Option<i32>,
    pub imdb_rating: Option<f32>,
    pub poster_url: Option<String>,
    pub synopsis: Option<String>,
    pub genres: Vec<String>,
    pub directors: Vec<String>,
    pub cast_members: Vec<ScrapedCastMember>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ScrapedCastMember {
    pub name: String,
    pub character_name: Option<String>,
    pub avatar_url: Option<String>,
}
