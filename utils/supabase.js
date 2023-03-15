import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import { getVehiclePositions, getTripUpdates, getGTFSDataFeed, saveGTFSDataFeed } from './transit-data.js'

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Update transit operators in Supabase
 */
async function updateOperatorsSupabase() {
  try {
    const response = await axios.get(
      `http://api.511.org/transit/gtfsoperators?api_key=${process.env.API_KEY}`)
    const operators = response.data;
    for (const operator of operators) {
      const { error } = await supabase
        .from('operators')
        .upsert({ id: operator.Id, operator_name: operator.Name });
      if (error) {
        console.log(error);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * Get all transit operators from Supabase
 * @returns {object} JSON object
 */
async function getOperatorsSupabase() {
  const { data, error } = await supabase
    .from('operators')
    .select();
  return data;
}

/**
 * Delete all transit vehicle positions in Supabase
 * Called before positions are updated in updatePositions()
 */
async function deletePositionsSupabase() {
  const { error } = await supabase
    .from('realtime_positions')
    .delete()
    .neq('id', '');
  console.log('Delete Positions Completed')
  if (error) {
    console.error(error);
  }
}

/**
 * Update all transit vehicle positions in Supabase
 */
async function updatePositionsSupabase() {
  await deletePositionsSupabase();
  const positions = await getVehiclePositions();
  const data = [];
  for (const position of positions) {
    if (position.vehicle.trip) {
      const [operator, tripId] = position.vehicle.trip.tripId.split(':');
      data.push({
        id: `${position.vehicle.trip.tripId}:${position.vehicle.vehicle.id}`,
        operator: operator,
        trip_id: tripId,
        vehicle_id: position.vehicle.vehicle.id,
        route_id: position.vehicle.trip.routeId,
        direction_id: position.vehicle.trip.directionId,
        latitude: position.vehicle.position.latitude,
        longitude: position.vehicle.position.longitude,
        bearing: position.vehicle.position.bearing,
        speed: position.vehicle.position.speed,
        raw: position.vehicle,
      })
    }
  }
  const { error } = await supabase
    .from('realtime_positions')
    .insert(data);
  console.log('Insert Positions Completed')
  if (error) {
    console.error(error);
  }
}

/**
 * Get transit vehicle positions from Supabase
 * @returns {object} JSON object
 */
async function getPositionsSupabase() {
  const { data, error } = await supabase
    .from('realtime_positions')
    .select()
  return data;
}

/**
 * Delete all trip information in Supabase
 */
async function deleteTripsSupabase() {
  const { error } = await supabase
    .from('trip_updates')
    .delete()
    .neq('id', '');
  console.log('Delete Trips Completed')
  if (error) {
    console.error(error)
  }
}

/**
 * Update all trip information in Supabase
 */
async function updateTripInfoSupabase() {
  await deleteTripsSupabase();
  const trips = await getTripUpdates();
  const data = [];
  for (const trip of trips) {
    const [operator, tripId] = trip.tripUpdate.trip.tripId.split(':');
    data.push({
      id: trip.tripUpdate.trip.tripId,
      operator: operator,
      trip_id: tripId,
      route_id: trip.tripUpdate.trip.routeId,
      trip_stops: trip.tripUpdate.stopTimeUpdate,
      raw: trip.tripUpdate,
    })
  }
  const { error } = await supabase
    .from('trip_updates')
    .insert(data);
  console.log('Insert Trips Completed');
  if (error) {
    console.error(error);
  }
}

export { updateOperatorsSupabase, getOperatorsSupabase, updatePositionsSupabase, getPositionsSupabase, deletePositionsSupabase, deleteTripsSupabase, updateTripInfoSupabase }