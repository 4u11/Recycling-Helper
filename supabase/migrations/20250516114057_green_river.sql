/*
  # Add recycling machines tracking

  1. New Tables
    - `recycling_machines`
      - `id` (uuid, primary key)
      - `location_id` (uuid, foreign key to recycling_points)
      - `machine_type` (text) - Type of recycling machine
      - `status` (text) - Current status (operational, maintenance, offline)
      - `last_maintained` (timestamptz) - Last maintenance date
      - `capacity` (int) - Current capacity percentage
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Functions
    - `nearby_machines`: Returns available recycling machines within a radius
    - `update_machine_status`: Updates machine status and capacity

  3. Security
    - Enable RLS on recycling_machines table
    - Add policies for read access
*/

-- Create recycling machines table
CREATE TABLE IF NOT EXISTS recycling_machines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid REFERENCES recycling_points(id) ON DELETE CASCADE,
  machine_type text NOT NULL,
  status text NOT NULL DEFAULT 'operational',
  last_maintained timestamptz DEFAULT now(),
  capacity integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_status CHECK (status IN ('operational', 'maintenance', 'offline')),
  CONSTRAINT valid_capacity CHECK (capacity >= 0 AND capacity <= 100)
);

-- Enable RLS
ALTER TABLE recycling_machines ENABLE ROW LEVEL SECURITY;

-- Create policy for reading machine data
CREATE POLICY "Anyone can read machine data"
  ON recycling_machines
  FOR SELECT
  TO PUBLIC
  USING (true);

-- Function to get nearby machines with status
CREATE OR REPLACE FUNCTION nearby_machines(
  user_lat float8,
  user_lng float8,
  radius_km float8
)
RETURNS TABLE (
  machine_id uuid,
  location_id uuid,
  location_name text,
  machine_type text,
  status text,
  capacity integer,
  distance float8,
  latitude float8,
  longitude float8
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rm.id as machine_id,
    rm.location_id,
    rp.name as location_name,
    rm.machine_type,
    rm.status,
    rm.capacity,
    (
      6371 * acos(
        cos(radians(user_lat)) * cos(radians(rp.latitude)) *
        cos(radians(rp.longitude) - radians(user_lng)) +
        sin(radians(user_lat)) * sin(radians(rp.latitude))
      )
    ) AS distance,
    rp.latitude,
    rp.longitude
  FROM recycling_machines rm
  JOIN recycling_points rp ON rm.location_id = rp.id
  WHERE (
    6371 * acos(
      cos(radians(user_lat)) * cos(radians(rp.latitude)) *
      cos(radians(rp.longitude) - radians(user_lng)) +
      sin(radians(user_lat)) * sin(radians(rp.latitude))
    )
  ) <= radius_km
  ORDER BY distance;
END;
$$ LANGUAGE plpgsql;