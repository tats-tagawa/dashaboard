mapboxgl.accessToken =
  "pk.eyJ1IjoidGF0c3VtaXRhZ2F3YSIsImEiOiJjaWYwN2U1cjgwMHM2czVsdXZhMWRjbG5hIn0.afavIGCyZMveyGQG9jy3GA";
const map = new mapboxgl.Map({
  container: "map", // container ID
  style: "mapbox://styles/mapbox/light-v10", // style URL
  center: [-122.17596124368328, 37.66017438365425], // starting position [lng, lat]
  zoom: 10, // starting zoom
});

// Operators to load by default
const operators = ["SC","SF","SM","CT","AC"];

map.on("load", async () => {
  for (const operator of operators) {
    const operatorGeneralInfo = await getOperator(operator);
    const color = operatorGeneralInfo[0].color;
    updatePositions(map, operator, color);
    addShapes(operator, color);
    setInterval(() => {
      updatePositions(map, operator, color);
      console.log("Updated Positions");
    }, 15000);
  }
});

const popup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false,
});

// saves hover state of vehicle positions
let hoverSource = null;

/**
 * Show vehicle information markers and highlight
 * routes when vehicle positions are hovered over.
 */
map.on("mouseenter", operators, (e) => {
  map.getCanvas().style.cursor = "pointer";
  const properties = e.features[0].properties;
  const operator = properties.operator;
  const operatorName = properties.operatorName;
  const vehicleId = properties.vehicleId;
  const routeId = properties.routeId;
  const tripId = properties.tripId;
  const coordinates = [e.lngLat.lng, e.lngLat.lat];
  popup
    .setLngLat(coordinates)
    .setHTML(
      `<strong>Route: ${routeId}</strong><br>
    <strong>Vehicle: ${vehicleId}</strong><br>
    <strong>Operator: ${operatorName}</strong>`
    )
    .addTo(map);

  if (e.features.length > 0) {
    map.setFeatureState(
      {
        source: `${operator}-shapes`,
        id: `${tripId}`,
      },
      {
        hover: true,
      }
    );
    hoverSource = [operator, tripId];
  }
});

map.on("mouseleave", operators, (e) => {
  map.getCanvas().style.cursor = "";
  popup.remove();
  const [operator, tripId] = hoverSource;
  if (hoverSource !== null) {
    map.setFeatureState(
      {
        source: `${operator}-shapes`,
        id: tripId,
      },
      { hover: false }
    );
  }
  hoverSource = null;
});

// List of Data Sources added to map
// Used to compare with visible sources
// If not visible, remove source
const addedSources = [];

/**
 * Create and add vehicle position and route layers for
 * specified operator.
 * @param {object} map Object
 * @param {string} operator - operator's code name
 * @param {string} color - hex color value
 */
async function updatePositions(map, operator, color) {
  const positions = await getPositions(operator);
  const points = {
    type: "FeatureCollection",
    features: positions,
  };
  // Remove operator source if all vehicle's are inactive
  if (!positions.length && addedSources.includes(operator)) {
    map.removeSource(operator);
    map.removeSource(`${operator}-shapes`);
    console.log(`Removed ${operator} source`);
  }
  // Update source if vehicles are still active
  else if (addedSources.includes(operator)) {
    map.getSource(operator).setData(points);
  }
  // Only add source if operator has positions
  else if (positions.length) {
    map.addSource(operator, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: positions,
      },
      generateId: true,
    });

    addedSources.push(operator);

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
  }
}

/**
 * Retrive current vehicle positions and update to GeoJSON
 * @param {string} operator - operator's code name
 * @returns {object} GeoJSON object of all vehicle positions
 */
async function getPositions(operator) {
  try {
    const response = await fetch(
      `http://localhost:3000/positions?operator=${operator}`
    );
    
    const positions = await response.json();
    const operatorGeneralInfo = await getOperator(operator);    
    const operatorName = operatorGeneralInfo[0].name;
    const positionsGeoJSON = [];
    for (const position of positions) {
      const coordinates = [position.longitude, position.latitude];
      positionsGeoJSON.push({
        type: "Feature",
        properties: {
          operator: position.operator,
          operatorName: operatorName,
          tripId: position.trip_id,
          shapeId: position.shape_id,
          routeId: position.route_id,
          vehicleId: position.vehicle_id,
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
  } catch (error) {
    console.log(error);
  }
}

/**
 * Return coordinates of vehicles route.
 * @param {string} tripId
 * @returns {Feature}
 */
async function getShapeCoordinates(operator, shapeId) {
  const response = await fetch(
    `http://localhost:3000/shapes?operator=${operator}&shapeId=${shapeId}`
  );
  const data = await response.json();
  if (data.length) {
    return turf.lineString(data);
  } else {
    return false;
  }
}

async function addShapes(operator, color) {
  try {
    const positions = await getPositions(operator);
    const shapeIds = positions.reduce((acc, shape, index) => {
      acc.push(shape.properties.shapeId);
      return acc;
    }, []);
    const shapesFeatures = [];
    const shapes = await getAllShapeCoordinates(operator, shapeIds);
    for (const position of positions) {
      const tripId = position.properties.tripId;
      const shapeId = position.properties.shapeId;
      const coordinates = shapes[shapeId];
      const properties = {
        operator: operator,
        shapeId: shapeId,
        tripId: tripId,
      };
      const options = {
        id: `${operator}-${tripId}`,
      };
      shapesFeatures.push(turf.lineString(coordinates, properties, options));
    }

    map.addSource(`${operator}-shapes`, {
      type: "geojson",
      data: {
        type: "FeatureCollection",
        features: shapesFeatures,
      },
      promoteId: "tripId",
    });

    map.addLayer({
      id: `${operator}-shapes-layer`,
      type: "line",
      source: `${operator}-shapes`,
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
      paint: {
        "line-color": color,
        "line-width": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          3,
          0.5,
        ],
      },
    });
    // console.log(shapesFeatures);
  } catch (error) {
    console.error(error);
  }
}

async function getAllShapeCoordinates(operator, shapeIds) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operator: operator,
      shapeIds: shapeIds,
    }),
  };
  const response = await fetch("http://localhost:3000/shapes", options);
  const data = await response.json();
  return data;
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
