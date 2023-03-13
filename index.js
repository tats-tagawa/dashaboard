mapboxgl.accessToken =
  'pk.eyJ1IjoidGF0c3VtaXRhZ2F3YSIsImEiOiJjaWYwN2U1cjgwMHM2czVsdXZhMWRjbG5hIn0.afavIGCyZMveyGQG9jy3GA';
const map = new mapboxgl.Map({
  container: 'map', // container ID
  style: 'mapbox://styles/mapbox/light-v10', // style URL
  center: [-122.17596124368328, 37.66017438365425], // starting position [lng, lat]
  zoom: 10 // starting zoom
  // center: [-122, 37.4], // starting position [lng, lat]
  // zoom: 9.5 // starting zoom
})

map.on('load', async () => {
  map.addSource('all-transit', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: await processPositions(),
    }
  })
  map.addLayer({
    id: 'all-transit',
    type: 'circle',
    source: 'all-transit',
    paint: {
      'circle-color': '#000000',
      'circle-radius': 6,
      'circle-stroke-width': 2,
      'circle-stroke-color': '#FFFFFF'
    }
  })

});

async function getPositions() {
  const response = await fetch('http://localhost:3000/positions');
  const data = await response.json();
  return data
}

async function processPositions() {
  const positions = await getPositions();
  const positionsGeoJSON = [];
  for (const position of positions) {
    const coordinates = [position.longitude, position.latitude];
    positionsGeoJSON.push({
      type: 'Feature',
      id: position.id,
      properties: {
        operator: position.operator,
        tripId: position.trip_id,
        coordinates: coordinates,
        directionId: position.direction_id,
        bearing: position.bearing,
        speed: position.speed,
      },
      geometry: {
        type: 'Point',
        coordinates: coordinates,
      }
    });
  }
  return positionsGeoJSON;
}
