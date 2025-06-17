-- Query to get all RLS policies for documents, document_permissions, and related tables
-- Run this in your Supabase SQL editor to see all current policies

-- 1. Get all policies for documents table
SELECT 
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
ORDER BY policyname;

-- Add separator
SELECT '=== DOCUMENT_PERMISSIONS POLICIES ===' as separator;

-- 2. Get all policies for document_permissions table  
SELECT 
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
ORDER BY policyname;

-- Add separator
SELECT '=== MESSAGES POLICIES ===' as separator;

-- 3. Get all policies for messages table
SELECT 
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
ORDER BY policyname;

-- Add separator  
SELECT '=== RLS STATUS ===' as separator;

-- 4. Check which tables have RLS enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename IN ('documents', 'document_permissions', 'messages', 'tool_calls')
ORDER BY tablename; 