-- URL Groups (fallback if not using Alembic migrations)
CREATE TABLE IF NOT EXISTS url_groups (
    id UUID PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_url_groups_name ON url_groups(name);

CREATE TABLE IF NOT EXISTS url_group_members (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES url_groups(id) ON DELETE CASCADE,
    url VARCHAR(2048) NOT NULL,
    display_label VARCHAR(255),
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_group_url UNIQUE(group_id, url)
);

CREATE INDEX IF NOT EXISTS idx_url_group_members_group_id ON url_group_members(group_id);
