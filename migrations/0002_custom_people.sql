ALTER TABLE prayers ADD COLUMN IF NOT EXISTS custom_people_names json DEFAULT '[]'::json;
