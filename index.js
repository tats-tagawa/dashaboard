mapboxgl.accessToken =
  "pk.eyJ1IjoidGF0c3VtaXRhZ2F3YSIsImEiOiJjaWYwN2U1cjgwMHM2czVsdXZhMWRjbG5hIn0.afavIGCyZMveyGQG9jy3GA";
const map = new mapboxgl.Map({
  container: "map", // container ID
  style: "mapbox://styles/mapbox/light-v10", // style URL
  center: [-122.17596124368328, 37.66017438365425], // starting position [lng, lat]
  zoom: 10, // starting zoom
  // center: [-122, 37.4], // starting position [lng, lat]
  // zoom: 9.5 // starting zoom
});

map.on("load", async () => {
  map.addSource("CT", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: await getPositions("CT"),
    },
  });

  map.addLayer({
    id: "CT",
    type: "circle",
    source: "CT",
    paint: {
      "circle-color": "#E31837",
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#FFFFFF",
    },
  });
});

const popup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false,
});

map.on("mouseenter", ["CT"], (e) => {
  map.getCanvas().style.cursor = "pointer";
  const properties = e.features[0].properties;
  const operator = properties.operator;
  const coordinates = [e.lngLat.lng, e.lngLat.lat];
  const tripId = properties.tripId;
  popup
    .setLngLat(coordinates)
    .setHTML(
      `<strong>${tripId}</strong><br>
              <strong>${operator}</strong>`
    )
    .addTo(map);
});

map.on("mouseleave", ["CT"], () => {
  map.getCanvas().style.cursor = "";
  popup.remove();
});

async function updatePositions(operator = "RG") {
  const positions = await getPositions(operator);
  const points = {
    type: "FeatureCollection",
    features: positions,
  };
  map.getSource("CT").setData(points);
}

setInterval(() => {
  updatePositions("CT");
}, 30000);

async function getPositions(operator = "RG") {
  const response = await fetch(`http://localhost:3000/positions/${operator}`);
  const positions = await response.json();
  const positionsGeoJSON = [];
  for (const position of positions) {
    const coordinates = [position.longitude, position.latitude];
    positionsGeoJSON.push({
      type: "Feature",
      properties: {
        operator: position.operator,
        tripId: position.trip_id,
        coordinates: coordinates,
        directionId: position.direction_id,
        bearing: position.bearing,
        speed: position.speed,
      },
      geometry: {
        type: "Point",
        coordinates: coordinates,
      },
    });
  }
  return positionsGeoJSON;
}
