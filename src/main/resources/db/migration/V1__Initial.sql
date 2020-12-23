DROP TABLE IF EXISTS entities;
DROP TABLE IF EXISTS entities_source_data;
DROP TABLE IF EXISTS synonym;
DROP TABLE IF EXISTS word;

CREATE TABLE IF NOT EXISTS entities
(
    entity_code_in_source text NOT NULL,
    "action" text NOT NULL,
    entity_names text,
    entity_type text,
    gender text,
    places_of_inception text,
    dates_of_inception text,
    identification_documents text,
    addresses text,
    citizenships text,
    entity_sources text,
    full_record_file_path text,
    full_record_file_start_pos bigint,
    full_record_size bigint,
    last_mod_date_for_analytic_record bigint DEFAULT -1 NOT NULL,
    last_mod_date_for_source_data bigint DEFAULT -1 NOT NULL,
    delete_status boolean,
    list_name text,

    PRIMARY KEY (entity_code_in_source)
);

CREATE TABLE IF NOT EXISTS entities_source_data
(
    entity_code_in_source text NOT NULL,
    source_data           text,

    PRIMARY KEY(entity_code_in_source)
);

CREATE TABLE IF NOT EXISTS synonym
(
    id      integer NOT NULL,
    word    text,
    synonym text,

    PRIMARY KEY(id)
);


CREATE TABLE IF NOT EXISTS word
(
    id              bigint NOT NULL,
    word            text,
    original_source text,
    entry_date      text,
    num_times_found integer,
    first_name_freq integer,
    last_name_freq  integer,
    company_freq    integer,
    other_freq      integer,
    male_freq       integer,
    female_freq     integer,
    bl_freq         integer,
    wl_freq         integer,

    PRIMARY KEY(id)
);

CREATE SEQUENCE IF NOT EXISTS entities_seq;
CREATE SEQUENCE IF NOT EXISTS entities_source_data_seq;
CREATE SEQUENCE IF NOT EXISTS synonyms_seq;
CREATE SEQUENCE IF NOT EXISTS words_seq;

CREATE INDEX IF NOT EXISTS entities__delete_status__index ON entities(delete_status);
CREATE UNIQUE INDEX IF NOT EXISTS entities__entity_code_in_source__index ON entities(entity_code_in_source);
CREATE INDEX IF NOT EXISTS entities__list_name__index ON entities(list_name);
CREATE UNIQUE INDEX IF NOT EXISTS entities_source_data__entity_code_in_source__index ON entities_source_data(entity_code_in_source);
CREATE INDEX IF NOT EXISTS synonyms__word__index ON synonym(word);
CREATE INDEX IF NOT EXISTS words__word__index ON word(word);


