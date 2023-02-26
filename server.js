import axios from 'axios';
import express from 'express';
import * as dotenv from 'dotenv';
dotenv.config();
import realtime from './routes/transit-realtime.js';
import info from './routes/transit-info.js';
import { getVehiclePositions, getTripUpdates, getGTFSDataFeed, saveGTFSDataFeed } from './transit-data.js'


const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use('/realtime', realtime);
app.use('/info', info);

app.listen(port, () => {
    console.log(`Dashaboard listening on port ${port}`);
});


import { createClient } from '@supabase/supabase-js';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Update transit operators in Supabase
 */
async function updateOperators() {
    try {
        const response = await axios.get(
            `http://api.511.org/transit/gtfsoperators?api_key=${process.env.API_KEY}`)
        const operators = response.data;
        operators.forEach(async operator => {
            const { error } = await supabase
                .from('operators')
                .upsert({ id: operator.Id, operator_name: operator.Name });
            if (error) {
                console.log(error);
            }
        })
    } catch (error) {
        console.error(error);
    }
}

/**
 * Get all transit operators from Supabase
 * @returns {object} JSON object
 */
async function getOperators() {
    const { data, error } = await supabase
        .from('operators')
        .select();
    return data;
}

/**
 * Delete all transit vehicle positions in Supabase
 * Called before positions are updated in updatePositions()
 */
async function deletePositions() {
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
async function updatePositions() {
    await deletePositions();
    const positions = await getVehiclePositions();
    const data = [];
    positions.forEach(async (position) => {
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
    })
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
async function getPositions() {
    const { data, error } = await supabase
        .from('realtime_positions')
        .select()
    return data;
}

/**
 * Delete all trip information in Supabase
 */
async function deleteTrips() {
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
async function updateTripInfo() {
    await deleteTrips();
    const trips = await getTripUpdates();
    const data = [];
    trips.forEach(async (trip) => {
        const [operator, tripId] = trip.tripUpdate.trip.tripId.split(':');
        // Dealing with time is difficult....
        //
        // const startTime = trip.tripUpdate.trip.startTime || null;
        // let startDate = trip.tripUpdate.trip.startDate || null;
        // if (startDate && startTime) {
        //     startDate = startDate.replace(/(\d{4})(\d{2})(\d{2})/g, '$1-$2-$3');
        // }
        // let startTimestamp = new Date(`${startDate} ${startTime}`);
        // if (startTimestamp instanceof Date && !isNaN(startTimestamp.valueOf())) {
        //     startTimestamp.toISOString();
        // } else {
        //     startTimestamp = null;
        // }
        data.push({
            id: trip.tripUpdate.trip.tripId,
            operator: operator,
            trip_id: tripId,
            route_id: trip.tripUpdate.trip.routeId,
            trip_stops: trip.tripUpdate.stopTimeUpdate,
            raw: trip.tripUpdate,
            // start_timestamp: startTimestamp,
            // start_date: startDate,
            // start_time: startTime,
        })
    })
    const { error } = await supabase
        .from('trip_updates')
        .insert(data);
    console.log('Insert Trips Completed');
    if (error) {
        console.error(error);
    }
}