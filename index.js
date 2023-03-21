mapboxgl.accessToken =
  "pk.eyJ1IjoidGF0c3VtaXRhZ2F3YSIsImEiOiJjaWYwN2U1cjgwMHM2czVsdXZhMWRjbG5hIn0.afavIGCyZMveyGQG9jy3GA";
const map = new mapboxgl.Map({
  container: "map", // container ID
  style: "mapbox://styles/mapbox/light-v10", // style URL
  center: [-122.17596124368328, 37.66017438365425], // starting position [lng, lat]
  zoom: 10, // starting zoom
});

const operators = ["SA", "CT", "SC"];
map.on("load", async () => {
  for (const operator of operators) {
    const operatorGeneralInfo = await getOperator(operator);
    const color = operatorGeneralInfo[0].color;
    addSourcesAndLayers(map, operator, color);
  }
});

const popup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false,
});

let hoverSource = "";

map.on("mouseenter", operators, (e) => {
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
  map.setFeatureState(
    { source: `${operator}-${tripId}`, id: 0 },
    { hover: true }
  );
  hoverSource = `${operator}-${tripId}`;
});

map.on("mouseleave", operators, (e) => {
  map.getCanvas().style.cursor = "";
  popup.remove();
  map.setFeatureState({ source: hoverSource, id: 0 }, { hover: false });
});

async function addSourcesAndLayers(map, operator, color) {
  const positions = await getPositions(operator);
  map.addSource(operator, {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: positions,
    },
    generateId: true,
  });

  map.addLayer({
    id: operator,
    type: "circle",
    source: operator,
    paint: {
      "circle-color": color,
      "circle-radius": 6,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#FFFFFF",
    },
  });
  for (const position of positions) {
    const tripId = position.properties.tripId;
    const coordinates = await getShapeCoordinates(tripId);
    if (coordinates) {
      map.addSource(`${operator}-${tripId}`, {
        type: "geojson",
        data: await getShapeCoordinates(tripId),
        generateId: true,
      });

      map.addLayer({
        id: `${operator}-${tripId}`,
        type: "line",
        source: `${operator}-${tripId}`,
        layout: {
          "line-join": "round",
          "line-cap": "round",
        },
        paint: {
          "line-color": color,
          "line-width": 2,
          "line-opacity": [
            "case",
            ["boolean", ["feature-state", "hover"], false],
            1,
            0.05,
          ],
        },
      });
    }
  }
}

async function updatePositions(operator = "RG") {
  const positions = await getPositions(operator);
  const points = {
    type: "FeatureCollection",
    features: positions,
  };
  map.getSource("CT").setData(points);
}

// setInterval(() => {
//   updatePositions("CT");
// }, 30000);

async function getPositions(operator = "RG") {
  const response = await fetch(
    `http://localhost:3000/positions?operator=${operator}`
  );
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

async function getShapeCoordinates(tripId) {
  const response = await fetch(`http://localhost:3000/shapes?tripId=${tripId}`);
  const data = await response.json();
  return turf.lineString(data);
}

async function getOperators() {
  const response = await fetch("http://localhost:3000/operators");
  const data = await response.json();
  return datas;
}

async function getOperator(operator) {
  const response = await fetch(
    `http://localhost:3000/operator?operator=${operator}`
  );
  const data = await response.json();
  return data;
}
