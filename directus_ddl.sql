-- MSSQL Compatible
CREATE TABLE directus_access (
    id uniqueidentifier NOT NULL,
    role uniqueidentifier,
    "user" uniqueidentifier,
    policy uniqueidentifier NOT NULL,
    sort int,
    PRIMARY KEY (id),
    CONSTRAINT directus_access_role_foreign FOREIGN key (
        role
    ) REFERENCES directus_roles (id),
    CONSTRAINT directus_access_user_foreign FOREIGN key ("user") REFERENCES directus_users (id),
    CONSTRAINT directus_access_policy_foreign FOREIGN key (policy) REFERENCES directus_policies (id)
);

CREATE TABLE directus_permissions (
    id int IDENTITY(1, 1) NOT NULL,
    collection nvarchar(64) NOT NULL,
    "action" nvarchar(10) NOT NULL,
    permissions nvarchar(max),
    validation nvarchar(max),
    presets nvarchar(max),
    fields nvarchar(max),
    policy uniqueidentifier NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT directus_permissions_policy_foreign FOREIGN key (policy) REFERENCES directus_policies (id)
);

CREATE TABLE directus_policies (
    id uniqueidentifier NOT NULL,
    name nvarchar(100) NOT NULL,
    icon nvarchar(64) NOT NULL DEFAULT badge,
    description nvarchar(max),
    ip_access nvarchar(max),
    enforce_tfa bit NOT NULL DEFAULT 0,
    admin_access bit NOT NULL DEFAULT 0,
    app_access bit NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE TABLE directus_roles (
    id uniqueidentifier NOT NULL,
    name nvarchar(100) NOT NULL,
    icon nvarchar(64) NOT NULL DEFAULT supervised_user_circle,
    description nvarchar(max),
    parent uniqueidentifier,
    PRIMARY KEY (id),
    CONSTRAINT directus_roles_parent_foreign FOREIGN key (parent) REFERENCES directus_roles (id)
);

CREATE TABLE directus_files (
    id uniqueidentifier NOT NULL,
    storage nvarchar(255) NOT NULL,
    filename_disk nvarchar(255),
    filename_download nvarchar(255) NOT NULL,
    title nvarchar(255),
    "type" nvarchar(255),
    folder uniqueidentifier,
    uploaded_by uniqueidentifier,
    created_on datetime2 NOT NULL DEFAULT (getdate()),
    modified_by uniqueidentifier,
    modified_on datetime2 NOT NULL DEFAULT (getdate()),
    charset nvarchar(50),
    filesize bigint DEFAULT (NULL),
    width int,
    height int,
    duration int,
    embed nvarchar(200),
    description nvarchar(max),
    location nvarchar(max),
    tags nvarchar(max),
    metadata nvarchar(max),
    focal_point_x int,
    focal_point_y int,
    tus_id nvarchar(64),
    tus_data nvarchar(max),
    uploaded_on datetime2,
    should_backup bit, -- Optional - added by user to facilitate backup using this toolkit (can also be shouldBackup)
    PRIMARY KEY (id),
    CONSTRAINT directus_files_uploaded_by_foreign FOREIGN key (uploaded_by) REFERENCES directus_users (id),
    CONSTRAINT directus_files_modified_by_foreign FOREIGN key (modified_by) REFERENCES directus_users (id),
    CONSTRAINT directus_files_folder_foreign FOREIGN key (folder) REFERENCES directus_folders (id)
);

CREATE TABLE directus_folders (
    id uniqueidentifier NOT NULL,
    name nvarchar(255) NOT NULL,
    parent uniqueidentifier,
    should_backup bit, -- Optional - added by user to facilitate backup using this toolkit (can also be shouldBackup)
    PRIMARY KEY (id),
    CONSTRAINT directus_folders_parent_foreign FOREIGN key (parent) REFERENCES directus_folders (id)
);

CREATE TABLE directus_flows (
    id uniqueidentifier NOT NULL,
    name nvarchar(255) NOT NULL,
    icon nvarchar(64),
    color nvarchar(255),
    description nvarchar(max),
    status nvarchar(255) NOT NULL DEFAULT active,
    "trigger" nvarchar(255),
    accountability nvarchar(255) DEFAULT all,
    options nvarchar(max),
    operation uniqueidentifier,
    date_created datetime2 DEFAULT (getdate()),
    user_created uniqueidentifier,
    PRIMARY KEY (id),
    CONSTRAINT directus_flows_user_created_foreign FOREIGN key (user_created) REFERENCES directus_users (id)
);

CREATE UNIQUE
INDEX directus_flows_operation_unique ON directus_flows ("operation");

CREATE TABLE directus_operations (
    id uniqueidentifier NOT NULL,
    name nvarchar(255),
    "key" nvarchar(255) NOT NULL,
    "type" nvarchar(255) NOT NULL,
    position_x int NOT NULL,
    position_y int NOT NULL,
    options nvarchar(max),
    resolve uniqueidentifier,
    reject uniqueidentifier,
    flow uniqueidentifier NOT NULL,
    date_created datetime2 DEFAULT (getdate()),
    user_created uniqueidentifier,
    PRIMARY KEY (id),
    CONSTRAINT directus_operations_flow_foreign FOREIGN key (flow) REFERENCES directus_flows (id),
    CONSTRAINT directus_operations_user_created_foreign FOREIGN key (user_created) REFERENCES directus_users (id),
    CONSTRAINT directus_operations_resolve_foreign FOREIGN key (resolve) REFERENCES directus_operations (id),
    CONSTRAINT directus_operations_reject_foreign FOREIGN key (reject) REFERENCES directus_operations (id)
);

CREATE UNIQUE
INDEX directus_operations_resolve_unique ON directus_operations ("resolve");

CREATE UNIQUE
INDEX directus_operations_reject_unique ON directus_operations ("reject");

CREATE TABLE directus_settings(
    id int IDENTITY(1,1) NOT NULL,
    project_name nvarchar(100) NOT NULL DEFAULT Directus,
    project_url nvarchar(255),
    project_color nvarchar(255) NOT NULL DEFAULT #6644FF,
    project_logo uniqueidentifier,
    public_foreground uniqueidentifier,
    public_background uniqueidentifier,
    public_note nvarchar(max),
    auth_login_attempts int DEFAULT 25,
    auth_password_policy nvarchar(100),
    storage_asset_transform nvarchar(7) DEFAULT all,
    storage_asset_presets nvarchar(max),
    custom_css nvarchar(max),
    storage_default_folder uniqueidentifier,
    basemaps nvarchar(max),
    mapbox_key nvarchar(255),
    module_bar nvarchar(max),
    project_descriptor nvarchar(100),
    default_language nvarchar(255) NOT NULL DEFAULT en-US,
    custom_aspect_ratios nvarchar(max),
    public_favicon uniqueidentifier,
    default_appearance nvarchar(255) NOT NULL DEFAULT auto,
    default_theme_light nvarchar(255),
    theme_light_overrides nvarchar(max),
    default_theme_dark nvarchar(255),
    theme_dark_overrides nvarchar(max),
    report_error_url nvarchar(255),
    report_bug_url nvarchar(255),
    report_feature_url nvarchar(255),
    public_registration bit NOT NULL DEFAULT 0,
    public_registration_verify_email bit NOT NULL DEFAULT 1,
    public_registration_role uniqueidentifier,
    public_registration_email_filter nvarchar(max),
    visual_editor_urls nvarchar(max),
    PRIMARY KEY(id),
    CONSTRAINT directus_settings_public_registration_role_foreign FOREIGN key(public_registration_role) REFERENCES directus_roles(id),
    CONSTRAINT directus_settings_storage_default_folder_foreign FOREIGN key(storage_default_folder) REFERENCES directus_folders(id),
    CONSTRAINT directus_settings_project_logo_foreign FOREIGN key(project_logo) REFERENCES directus_files(id),
    CONSTRAINT directus_settings_public_foreground_foreign FOREIGN key(public_foreground) REFERENCES directus_files(id),
    CONSTRAINT directus_settings_public_background_foreign FOREIGN key(public_background) REFERENCES directus_files(id),
    CONSTRAINT directus_settings_public_favicon_foreign FOREIGN key(public_favicon) REFERENCES directus_files(id)
);