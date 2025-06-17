-- Debug query to find ALL policies that might be causing circular dependencies
-- Run this in Supabase SQL editor after restoring the stable policy

SELECT 
    '=== DOCUMENTS POLICIES ===' as separator,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'documents'
UNION ALL

SELECT 
    '=== DOCUMENT_PERMISSIONS POLICIES ===' as separator,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'document_permissions'
UNION ALL

SELECT 
    '=== MESSAGES POLICIES ===' as separator,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'messages'
UNION ALL

SELECT 
    '=== FOLDERS POLICIES ===' as separator,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'folders'
UNION ALL

SELECT 
    '=== COMMENTS POLICIES ===' as separator,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'comments'
UNION ALL

SELECT 
    '=== COMMENT_THREADS POLICIES ===' as separator,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'comment_threads'
UNION ALL

SELECT 
    '=== OTHER TABLES WITH POLICIES ===' as separator,
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename NOT IN ('documents', 'document_permissions', 'messages', 'folders', 'comments', 'comment_threads')
    AND schemaname = 'public';

-- Also check if there are any policies we might have missed
SELECT '=== CHECKING FOR HIDDEN ISSUES ===' as debug;

-- Check if RLS is enabled on tables
SELECT 
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public'
    AND tablename IN ('documents', 'document_permissions', 'messages', 'tool_calls', 'folders', 'comments', 'comment_threads')
ORDER BY tablename;

-- Check for any functions that might be involved
SELECT '=== FUNCTIONS THAT MIGHT AFFECT POLICIES ===' as debug;

SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_result(p.oid) as return_type,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
    AND p.proname LIKE '%document%'
ORDER BY p.proname; 