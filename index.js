mapboxgl.accessToken =
  "pk.eyJ1IjoidGF0c3VtaXRhZ2F3YSIsImEiOiJjaWYwN2U1cjgwMHM2czVsdXZhMWRjbG5hIn0.afavIGCyZMveyGQG9jy3GA";
const map = new mapboxgl.Map({
  container: "map", // container ID
  style: "mapbox://styles/mapbox/light-v10", // style URL
  center: [-122.17596124368328, 37.66017438365425], // starting position [lng, lat]
  zoom: 10, // starting zoom
});

// Operators to load by default
const operators = ["SA", "CT", "SC"];
// const operators = ["SC"];

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

// saves hover state of vehicle positions
let hoverSource = "";

/**
 * Show vehicle information markers and highlight
 * routes when vehicle positions are hovered over.
 */
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

/**
 * Create and add vehicle position and route layers for
 * specified operator.
 * @param {object} map Object
 * @param {string} operator - operator's code name
 * @param {string} color - hex color value
 */
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
      "circle-stroke-width": 1,
      "circle-stroke-color": "#000000",
    },
  });

  for (const position of positions) {
    const tripId = position.properties.tripId;
    const coordinates = await getShapeCoordinates(operator, tripId);
    if (coordinates) {
      map.addSource(`${operator}-${tripId}`, {
        type: "geojson",
        data: coordinates,
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

/**
 * Update vehicle positions on map
 * @param {string} operator - operator's code name
 */
async function updatePositions(operator = "RG") {
  const positions = await getPositions(operator);
  const points = {
    type: "FeatureCollection",
    features: positions,
  };
  map.getSource(operator).setData(points);
}

setInterval(() => {
  for (const operator of operators) {
    updatePositions(operator);
  }
  console.log("Updated Positions");
}, 30000);

/**
 * Retrive current vehicle positions and update to GeoJSON
 * @param {string} operator - operator's code name
 * @returns {object} GeoJSON object of all vehicle positions
 */
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

/**
 * Return coordinates of vehicles route.
 * @param {string} tripId
 * @returns {Feature}
 */
async function getShapeCoordinates(operator, tripId) {
  const response = await fetch(
    `http://localhost:3000/shapes?operator=${operator}&tripId=${tripId}`
  );
  const data = await response.json();
  if (data.length) {
  return turf.lineString(data);
  } else {
  return false;
  }
}

/**
 * Get all operator information
 * @returns {object}
 */
async function getOperators() {
  const response = await fetch("http://localhost:3000/operators");
  const data = await response.json();
  return data;
}

/**
 * Get specified operator information
 * @param {string} operator - operator's code name
 * @returns {object}
 */
async function getOperator(operator) {
  return new Promise(async (resolve, reject) => {
    const response = await fetch(
      `http://localhost:3000/operator?operator=${operator}`
    );
    const data = await response.json();
    resolve(data);
  });
}
