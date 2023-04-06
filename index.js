mapboxgl.accessToken =
  "pk.eyJ1IjoidGF0c3VtaXRhZ2F3YSIsImEiOiJjaWYwN2U1cjgwMHM2czVsdXZhMWRjbG5hIn0.afavIGCyZMveyGQG9jy3GA";
const map = new mapboxgl.Map({
  container: "map", // container ID
  style: "mapbox://styles/mapbox/light-v10", // style URL
  center: [-122.17596124368328, 37.66017438365425], // starting position [lng, lat]
  zoom: 10, // starting zoom
});

// Operators to load by default
const selectedOperators = [];
let allOperators = [];

// store setIntervals for all operators
let intervals = {};

// saves hover state of vehicle positions
let hoverSource = null;

// List of Data Sources added to map
// Used to compare with visible sources
// If not visible, remove source
const addedSources = [];

// popup bubble config
const popup = new mapboxgl.Popup({
  closeButton: false,
  closeOnClick: false,
});

map.on("load", async () => {
  await createMenu();
});

/**
 * Create and add vehicle position and route layers for
 * specified operator.
 * @param {object} map Object
 * @param {string} operator - operator's code name
 * @param {string} color - hex color value
 */
async function updatePositions(operator, color) {
  const positions = await getPositions(operator);
  const positionsFeatureCollection = {
    type: "FeatureCollection",
    features: positions,
  };
  // Remove operator source if all vehicle's are inactive
  if (!positions.length && map.getSource(`${operator}-positions`)) {
    map.removeLayer(`${operator}-positions-layer`);
    map.removeSource(`${operator}-positions`);
    console.log(`Removed ${operator} source`);
  }
  // Update source if vehicles are still active
  else if (map.getSource(`${operator}-positions`)) {
    map.getSource(`${operator}-positions`).setData(positionsFeatureCollection);
  }
  // Only add source if operator has positions
  else if (positions.length) {
    map.addSource(`${operator}-positions`, {
      type: "geojson",
      data: positionsFeatureCollection,
      generateId: true,
    });

    addedSources.push(operator);

    map.addLayer({
      id: `${operator}-positions-layer`,
      type: "circle",
      source: `${operator}-positions`,
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

async function updateShapes(operator, color) {
  try {
    const positions = await getPositions(operator);
    const shapeIds = positions.reduce((acc, shape) => {
      acc.push(shape.properties.shapeId);
      return acc;
    }, []);
    const shapesFeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };
    const shapes = await getAllShapeCoordinates(operator, shapeIds);
    for (const position of positions) {
      const tripId = position.properties.tripId;
      const shapeId = position.properties.shapeId;
      const coordinates = shapes[shapeId];
      if (!tripId || !shapeId) continue;
      const properties = {
        operator: operator,
        shapeId: shapeId,
        tripId: tripId,
      };
      const options = {
        id: `${operator}-${tripId}`,
      };
      shapesFeatureCollection.features.push(
        turf.lineString(coordinates, properties, options)
      );
    }
    // remove shapes if all operator vehicles are inactive
    if (!Object.keys(shapes).length && map.getSource(`${operator}-shapes`)) {
      map.removeLayer(`${operator}-shapes-layer`);
      map.removeSource(`${operator}-shapes`);
      console.log(`Removed ${operator}-shapes source`);
    }
    // Update shapes if vehicles are still active
    else if (map.getSource(`${operator}-shapes`)) {
      map.getSource(`${operator}-shapes`).setData(shapesFeatureCollection);
    }
    // Only add shapes if operator has positions and shapes
    else if (
      shapesFeatureCollection.features.length &&
      Object.keys(shapes).length
    ) {
      map.addSource(`${operator}-shapes`, {
        type: "geojson",
        data: shapesFeatureCollection,
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
    }
    // console.log(shapesFeatures);
  } catch (error) {
    console.log(error);
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
 * Get specified operator information
 * @param {string} operator - operator's code name
 * @returns {object}
 */
async function getOperator(operator) {
  const response = await fetch(
    `http://localhost:3000/operator?operator=${operator}`
  );
  const data = await response.json();
  return data;
}

async function getActiveOperators() {
  const response = await fetch(`http://localhost:3000/activeOperators`);
  const data = await response.json();
  return data;
}

async function createMenu() {
  try {
    const selection = document.getElementById("selections");
    const form = document.createElement("form");
    selection.appendChild(form);
    allOperators = await getActiveOperators();
    allOperators = allOperators.map((operator) => operator.operator)
    console.log(allOperators)
    const allOperatorsSorted = allOperators.sort();

    for (const operator of allOperatorsSorted) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = operator;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(operator));
      form.appendChild(label);
      const br = document.createElement("br");
      form.appendChild(br);

      const operatorGeneralInfo = await getOperator(operator);
      const color = operatorGeneralInfo[0].color;
      label.addEventListener("change", async (e) => {
        const checked = e.target.checked;
        const op = e.target.value;
        if (checked) {
          selectedOperators.push(op);
          checkbox.disabled = true;
          await updateShapes(op, color);
          await updatePositions(op, color);
          checkbox.disabled = false;
          map.on("mouseenter", `${op}-positions-layer`, addHoverEvent);
          map.on("mouseleave", `${op}-positions-layer`, removeHoverEvent);
          intervals[op] = setInterval(async () => {
            await updateShapes(operator, color);
            await updatePositions(operator, color);
            console.log("Updated Positions");
          }, 60000);
        }
        if (!checked) {
          const index = selectedOperators.indexOf(op);
          if (index !== -1) {
            selectedOperators.splice(index, 1);
          }
          map.off("mouseenter", `${op}-positions-layer`, addHoverEvent);
          map.off("mouseleave", `${op}-positions-layer`, removeHoverEvent);
          clearInterval(intervals[op]);
          intervals[op] = null;

          if (map.getSource(`${op}-shapes`)) {
            map.removeLayer(`${op}-shapes-layer`);
            map.removeSource(`${op}-shapes`);
          }
          if (map.getSource(`${op}-positions`)) {
            map.removeLayer(`${op}-positions-layer`);
            map.removeSource(`${op}-positions`);
          }
        }
      });
    }
  } catch (error) {
    console.error(error);
  }
}

function addHoverEvent(e) {
  map.getCanvas().style.cursor = "pointer";
  const properties = e.features[0].properties;
  const operator = properties.operator;
  const operatorName = properties.operatorName;
  const vehicleId = properties.vehicleId;
  const routeId = properties.routeId;
  const shapeId = properties.shapeId;
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

  if (e.features.length > 0 && shapeId) {
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
}

function removeHoverEvent() {
  map.getCanvas().style.cursor = "";
  popup.remove();
  if (hoverSource !== null) {
    const [operator, tripId] = hoverSource;
    map.setFeatureState(
      {
        source: `${operator}-shapes`,
        id: tripId,
      },
      { hover: false }
    );
  }
  hoverSource = null;
}
