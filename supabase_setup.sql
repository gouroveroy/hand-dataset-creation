-- SQL Migration Script for Supabase Setup
-- This script creates the required 'annotations' table and configures the 'dataset_images' storage bucket.
-- You can run this directly in the Supabase SQL Editor (Dashboard > SQL Editor > New query).

--------------------------------------------------------------------------------
-- 1. Create the 'annotations' Table
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.annotations (
    -- Unique identifier for each annotation record
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- The user ID identifier entered by the annotator
    user_id TEXT NOT NULL,
    
    -- URLs pointing to the public Supabase storage files
    base_image_url TEXT NOT NULL,
    annotated_image_url TEXT NOT NULL,
    
    -- JSONB fields to hold arrays of bounding boxes and fingertip coordinates
    hand_boxes JSONB NOT NULL DEFAULT '[]'::jsonb,
    target_boxes JSONB NOT NULL DEFAULT '[]'::jsonb,
    fingertips JSONB NOT NULL DEFAULT '[]'::jsonb,
    
    -- Pointing action classification (e.g., 'pointing from distance', 'pointing at empty space', 'None')
    pointing_type TEXT NOT NULL DEFAULT 'None',
    
    -- Timestamp when the record was saved
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Add comments to the table and columns for documentation
COMMENT ON TABLE public.annotations IS 'Stores hand-bounding box, target-bounding box, and fingertip coordinates for dataset annotation.';
COMMENT ON COLUMN public.annotations.hand_boxes IS 'Array of Hand Box coordinates and metadata (e.g., pointing_type).';
COMMENT ON COLUMN public.annotations.target_boxes IS 'Array of Target Box coordinates and metadata.';
COMMENT ON COLUMN public.annotations.fingertips IS 'Array of fingertip keypoints.';

--------------------------------------------------------------------------------
-- 2. Configure Row Level Security (RLS) for Annotations Table
--------------------------------------------------------------------------------

-- Enable Row Level Security (RLS)
ALTER TABLE public.annotations ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anyone to insert annotations (for client uploads)
CREATE POLICY "Allow public insert access" ON public.annotations
    FOR INSERT 
    WITH CHECK (true);

-- Policy: Allow users to view all annotations
CREATE POLICY "Allow public select access" ON public.annotations
    FOR SELECT 
    USING (true);

-- Policy: Allow users to delete annotations (required for gallery management)
CREATE POLICY "Allow public delete access" ON public.annotations
    FOR DELETE 
    USING (true);

--------------------------------------------------------------------------------
-- 3. Storage Bucket Setup ('dataset_images')
--------------------------------------------------------------------------------

-- Ensure the public bucket 'dataset_images' exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('dataset_images', 'dataset_images', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: Allow anyone to view/download files from the dataset_images bucket
CREATE POLICY "Allow public read access to images" ON storage.objects
    FOR SELECT 
    TO public 
    USING (bucket_id = 'dataset_images');

-- Policy: Allow anyone to upload images to the dataset_images bucket
CREATE POLICY "Allow public upload access to images" ON storage.objects
    FOR INSERT 
    TO public 
    WITH CHECK (bucket_id = 'dataset_images');

-- Policy: Allow anyone to delete images from the dataset_images bucket
CREATE POLICY "Allow public delete access to images" ON storage.objects
    FOR DELETE 
    TO public 
    USING (bucket_id = 'dataset_images');
