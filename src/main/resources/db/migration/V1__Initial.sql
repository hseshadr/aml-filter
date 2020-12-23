CREATE TABLE admin_logs
(
  id                bigint NOT NULL,
  task_name         text,
  component_name    text,
  context           text,
  record_entry_time bigint DEFAULT -1 NOT NULL,
  id_process        bigint,
  description       text,

PRIMARY KEY(id)
);

CREATE TABLE configuration
(
  id          bigint NOT NULL,
  name        text NOT NULL,
  description text,

PRIMARY KEY(id)
);

CREATE TABLE configuration_entry
(
  id             bigint NOT NULL,
  property_name  text NOT NULL,
  property_value text NOT NULL,

PRIMARY KEY(id)
);


CREATE TABLE configuration_entry_map
(
  id_configuration_entry bigint NOT NULL,
  id_configuration       bigint NOT NULL,

PRIMARY KEY(id_configuration_entry, id_configuration)
);

CREATE TABLE ip_address
(
  ip_address     text NOT NULL,
  blocked_status boolean DEFAULT false,

PRIMARY KEY(ip_address)
);

CREATE TABLE ip_address_process_map
(
  id_process bigint NOT NULL,
  ip_address text NOT NULL,

PRIMARY KEY(id_process, ip_address)
);

CREATE TABLE entities
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

PRIMARY KEY
(
entity_code_in_source
)
);

CREATE TABLE entities_source_data
(
  entity_code_in_source text NOT NULL,
  source_data           text,

PRIMARY KEY(entity_code_in_source)
);

CREATE TABLE process
(
  id               bigint NOT NULL,
  id_configuration bigint NOT NULL,
  enabled          boolean DEFAULT true,
  company          text NOT NULL,
  division         text NOT NULL,
  description      text,

PRIMARY KEY(id)
);


CREATE TABLE search_requests
(
  id                     bigint NOT NULL,
  id_process             bigint NOT NULL,
  hit_time               bigint NOT NULL,
  total_time             bigint NOT NULL,
  number_of_search_names bigint NOT NULL,
  remote_addr            text,
  remote_host            text,
  billing_user_id        text,

PRIMARY KEY(id)
);


CREATE TABLE suspect_file_processing_status
(
  processing_file_path      text NOT NULL,
  incoming_file_name        text,
  record_creation_date      bigint DEFAULT -1 NOT NULL,
  record_last_modified_date bigint DEFAULT -1 NOT NULL,
  processing_status         text,
  load_type                 text,
  feed_type                 text,
  description               text,
  list_name                 text,
  error_code                text,

PRIMARY KEY(processing_file_path)
);

CREATE TABLE synonym
(
  id      integer NOT NULL,
  word    text,
  synonym text,

PRIMARY KEY(id)
);


CREATE TABLE word
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

CREATE SEQUENCE entities_seq;
CREATE SEQUENCE admin_logs_seq;
CREATE SEQUENCE configuration_entry_seq;
CREATE SEQUENCE configuration_seq;
CREATE SEQUENCE entities_source_data_seq;
CREATE SEQUENCE process_seq;
CREATE SEQUENCE search_requests_seq;
CREATE SEQUENCE synonyms_seq;
CREATE SEQUENCE words_seq;

CREATE INDEX entities__delete_status__index ON entities
USING btree(delete_status);
CREATE UNIQUE INDEX entities__entity_code_in_source__index ON entities
USING btree(entity_code_in_source);
CREATE INDEX entities__list_name__index ON entities
USING btree(list_name);
CREATE UNIQUE INDEX entities_source_data__entity_code_in_source__index ON entities_source_data
USING btree(entity_code_in_source);
CREATE INDEX search_requests__hit_time__index ON search_requests
USING btree(hit_time);
CREATE INDEX search_requests__id_process__index ON search_requests
USING btree(id_process);
CREATE INDEX suspect_file_processing_status__feed_type__index ON suspect_file_processing_status
USING btree(feed_type);
CREATE INDEX suspect_file_processing_status__incoming_file_name__index ON suspect_file_processing_status
USING btree(incoming_file_name);
CREATE INDEX suspect_file_processing_status__load_type__index ON suspect_file_processing_status
USING btree(load_type);
CREATE INDEX suspect_file_processing_status__processing_file_path__index ON suspect_file_processing_status
USING btree(processing_file_path);
CREATE INDEX suspect_file_processing_status__processing_status__index ON suspect_file_processing_status
USING btree(processing_status);
CREATE INDEX synonyms__word__index ON synonym
USING btree(word);
CREATE INDEX words__word__index ON word
USING btree(word);


