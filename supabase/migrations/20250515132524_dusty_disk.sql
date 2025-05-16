/*
  # Create recycling points table

  1. New Tables
    - `recycling_points`
      - `id` (uuid, primary key)
      - `name` (text)
      - `type` (text)
      - `latitude` (float8)
      - `longitude` (float8)
      - `operating_hours` (text)
      - `phone` (text)
      - `created_at` (timestamptz)

  2. Functions
    - `nearby_points`: Calculates nearby recycling points within a given radius
*/

CREATE TABLE IF NOT EXISTS recycling_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  latitude float8 NOT NULL,
  longitude float8 NOT NULL,
  operating_hours text NOT NULL,
  phone text,
  created_at timestamptz DEFAULT now()
);

-- Function to calculate nearby points
CREATE OR REPLACE FUNCTION nearby_points(
  user_lat float8,
  user_lng float8,
  radius_km float8
)
RETURNS TABLE (
  id uuid,
  name text,
  type text,
  latitude float8,
  longitude float8,
  operating_hours text,
  phone text,
  distance float8
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rp.id,
    rp.name,
    rp.type,
    rp.latitude,
    rp.longitude,
    rp.operating_hours,
    rp.phone,
    (
      6371 * acos(
        cos(radians(user_lat)) * cos(radians(latitude)) *
        cos(radians(longitude) - radians(user_lng)) +
        sin(radians(user_lat)) * sin(radians(latitude))
      )
    ) AS distance
  FROM recycling_points rp
  WHERE (
    6371 * acos(
      cos(radians(user_lat)) * cos(radians(latitude)) *
      cos(radians(longitude) - radians(user_lng)) +
      sin(radians(user_lat)) * sin(radians(latitude))
    )
  ) <= radius_km
  ORDER BY distance;
END;
$$ LANGUAGE plpgsql;