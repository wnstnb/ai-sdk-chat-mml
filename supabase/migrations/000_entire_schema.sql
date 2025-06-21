-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.comment_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  thread_id character varying NOT NULL UNIQUE,
  status character varying DEFAULT 'open'::character varying CHECK (status::text = ANY (ARRAY['open'::character varying, 'resolved'::character varying]::text[])),
  created_by uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamp with time zone,
  selection_data jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT comment_threads_pkey PRIMARY KEY (id),
  CONSTRAINT comment_threads_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT comment_threads_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT comment_threads_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES auth.users(id)
);
CREATE TABLE public.comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  content jsonb NOT NULL,
  author_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  mentioned_users ARRAY DEFAULT '{}'::uuid[],
  CONSTRAINT comments_pkey PRIMARY KEY (id),
  CONSTRAINT comments_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.comment_threads(id),
  CONSTRAINT comments_author_id_fkey FOREIGN KEY (author_id) REFERENCES auth.users(id)
);
CREATE TABLE public.document_autosaves (
  autosave_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL,
  content jsonb,
  autosave_timestamp timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  CONSTRAINT document_autosaves_pkey PRIMARY KEY (autosave_id),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_document FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT document_autosaves_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT document_autosaves_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id)
);
CREATE TABLE public.document_manual_saves (
  manual_save_id uuid NOT NULL DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL,
  content jsonb,
  manual_save_timestamp timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL,
  CONSTRAINT document_manual_saves_pkey PRIMARY KEY (manual_save_id),
  CONSTRAINT fk_document FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT document_manual_saves_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT document_manual_saves_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.document_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  permission_level character varying NOT NULL CHECK (permission_level::text = ANY (ARRAY['owner'::character varying, 'editor'::character varying, 'commenter'::character varying, 'viewer'::character varying]::text[])),
  granted_by uuid NOT NULL,
  granted_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT document_permissions_pkey PRIMARY KEY (id),
  CONSTRAINT document_permissions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT document_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT document_permissions_granted_by_fkey FOREIGN KEY (granted_by) REFERENCES auth.users(id)
);
CREATE TABLE public.documents (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  folder_id uuid,
  name text NOT NULL DEFAULT 'Untitled Document'::text,
  content jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  searchable_content text,
  abstract_summary text,
  extractive_summary text,
  is_starred boolean NOT NULL DEFAULT false,
  CONSTRAINT documents_pkey PRIMARY KEY (id),
  CONSTRAINT documents_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT documents_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id)
);
CREATE TABLE public.documents_embeddings (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL UNIQUE,
  user_id uuid NOT NULL,
  embedding USER-DEFINED NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT documents_embeddings_pkey PRIMARY KEY (id),
  CONSTRAINT documents_embeddings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT documents_embeddings_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id)
);
CREATE TABLE public.folders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  parent_folder_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT folders_pkey PRIMARY KEY (id),
  CONSTRAINT folders_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT folders_parent_folder_id_fkey FOREIGN KEY (parent_folder_id) REFERENCES public.folders(id)
);
CREATE TABLE public.messages (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  document_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
  content jsonb,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT messages_pkey PRIMARY KEY (id),
  CONSTRAINT messages_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type character varying NOT NULL CHECK (type::text = ANY (ARRAY['mention'::character varying, 'comment'::character varying, 'document_shared'::character varying, 'permission_changed'::character varying, 'user_joined'::character varying]::text[])),
  title character varying NOT NULL,
  message text,
  data jsonb DEFAULT '{}'::jsonb,
  read boolean DEFAULT false,
  document_id uuid,
  created_by uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT notifications_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id),
  CONSTRAINT notifications_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  preferences jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT preferences_pkey PRIMARY KEY (id),
  CONSTRAINT preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  updated_at timestamp with time zone,
  email text UNIQUE,
  billing_cycle USER-DEFINED,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_subscription_status text,
  trial_ends_at timestamp with time zone,
  subscription_ends_at timestamp with time zone,
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.tool_calls (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tool_name text NOT NULL,
  tool_input jsonb,
  tool_output jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  tool_call_id text NOT NULL,
  CONSTRAINT tool_calls_pkey PRIMARY KEY (id),
  CONSTRAINT tool_calls_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.messages(id),
  CONSTRAINT tool_calls_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);