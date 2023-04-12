mapboxgl.accessToken =
  "pk.eyJ1IjoidGF0c3VtaXRhZ2F3YSIsImEiOiJjaWYwN2U1cjgwMHM2czVsdXZhMWRjbG5hIn0.afavIGCyZMveyGQG9jy3GA";
const map = new mapboxgl.Map({
  container: "map", // container ID
  style: "mapbox://styles/mapbox/light-v10", // style URL
  center: [-122.17596124368328, 37.66017438365425], // starting position [lng, lat]
  zoom: 10, // starting zoom
});

// Currently selected operators to show on map
const selectedOperators = [];

// List of all currently active operators
let allOperators = [];

// Store setIntervals for updating vehicle positions
let intervals = {};

// Store hover state of vehicle positions
let hoverSource = null;

// Popup bubble config
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
 * @param {string} operator - operator code name
 * @param {string} color - hex color value
 */
async function updatePositions(operator, color) {
  const positions = await getPositions(operator);
  const positionsFeatureCollection = {
    type: "FeatureCollection",
    features: positions,
  };

  // Remove operator source and layers if all vehicle's are inactive
  if (!positions.length && map.getSource(`${operator}-positions`)) {
    map.removeLayer(`${operator}-positions-layer`);
    map.removeSource(`${operator}-positions`);
    console.log(`Removed ${operator} source`);
  }

  // Update positions if there are active vehicles
  else if (map.getSource(`${operator}-positions`)) {
    map.getSource(`${operator}-positions`).setData(positionsFeatureCollection);
  }

  // Create source and layer and plot positions
  else if (positions.length) {
    map.addSource(`${operator}-positions`, {
      type: "geojson",
      data: positionsFeatureCollection,
      generateId: true,
    });

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
 * @param {string} operator - operator code name
 * @returns {object} GeoJSON object of all vehicle positions
 */
async function getPositions(operator) {
  try {
    const response = await fetch(
      `http://localhost:3000/positions?operator=${operator}`
    );
    const positions = await response.json();
    const operatorGeneralInfo = await getOperator(operator);
    const operatorName = operatorGeneralInfo.name;

    // Store all positions as GeoJSON
    const positionFeatures = [];
    for (const position of positions) {
      const coordinates = [position.longitude, position.latitude];
      positionFeatures.push({
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
    return positionFeatures;
  } catch (error) {
    console.log(error);
  }
}

/**
 * Update shapes on map
 * @param {string} operator - operator code name
 * @param {string} color - hex color code
 */
async function updateShapes(operator, color) {
  try {
    const positions = await getPositions(operator);

    // Get shape ids of all active transit routes
    // const shapeIds = positions.reduce((acc, shape) => {
    //   acc.push(shape.properties.shapeId);
    //   return acc;
    // }, []);

    const shapeIds = [];
    const tripIds = [];
    for (const position of positions) {
      shapeIds.push(position.properties.shapeId);
      tripIds.push(position.properties.tripId);
    }

    const shapesFeatureCollection = {
      type: "FeatureCollection",
      features: [],
    };

    const tripStopsFeatureCollection = {
      type: "FeatureCollection",
      features: [],
    }

    // Create GeoJSON with route coodinates of active transit lines
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

    // Remove operator source and layers if all vehicle's are inactive
    if (!Object.keys(shapes).length && map.getSource(`${operator}-shapes`)) {
      map.removeLayer(`${operator}-shapes-layer`);
      map.removeSource(`${operator}-shapes`);
      console.log(`Removed ${operator}-shapes source`);
    }
    // Update shapes to add/remove active/inactive transit routes
    else if (map.getSource(`${operator}-shapes`)) {
      map.getSource(`${operator}-shapes`).setData(shapesFeatureCollection);
    }
    // Create source and layer and plot routes
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

    const tripStops = await getOperatorTripStops(operator, tripIds);
    for (const tripStop of tripStops) {
      const coordinates = [tripStop.stop_lon, tripStop.stop_lat];
      tripStopsFeatureCollection.features.push({
        type: "Feature",
        properties: {
          
        },
        geometry: {
          type: "Point",
          coordinates: coordinates,
        },
      });
    }
    map.addSource(`${operator}-trip-stops`, {
      type: "geojson",
      data: tripStopsFeatureCollection,
      generateId: true,
    });

    map.addLayer({
      id: `${operator}-trip-stops-layer`,
      type: "circle",
      source: `${operator}-trip-stops`,
      paint: {
        "circle-color": "#ffffff",
        "circle-radius": 3,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#000",
      },
    });
  } catch (error) {
    console.log(error);
  }
}

/**
 * Get coordinates for all specified shapes
 * @param {string} operator - operator code name
 * @param {array} shapeIds - array with shape ids
 * @returns
 */
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
  return data[0];
}

/**
 * Returns array of operators that are currently active
 * @returns array
 */
async function getActiveOperators() {
  const response = await fetch(`http://localhost:3000/active-operators`);
  const data = await response.json();
  return data;
}

/**
 * Create menu for users to select operator to show on map
 */
async function createMenu() {
  try {
    const selection = document.getElementById("selections");
    const form = document.createElement("form");
    form.setAttribute("id", "form");
    selection.appendChild(form);
    allOperators = await getActiveOperators();
    const allOperatorsSorted = allOperators.sort();

    // Create checkbox for each active operator
    for (const operator of allOperatorsSorted) {
      const operatorGeneralInfo = await getOperator(operator);
      const color = operatorGeneralInfo.color;
      const commonName = operatorGeneralInfo.common_name;
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = operator;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(commonName));
      form.appendChild(label);
      const br = document.createElement("br");
      form.appendChild(br);

      label.addEventListener("change", async (e) => {
        const checked = e.target.checked;
        const op = e.target.value;
        // Add shapes and positions when checkbox is checked
        if (checked) {
          selectedOperators.push(op);
          checkbox.disabled = true;
          await updateShapes(op, color);
          await updatePositions(op, color);
          checkbox.disabled = false;
          map.on(
            "mouseenter",
            `${op}-positions-layer`,
            enterPositionsHoverEvent
          );
          map.on(
            "mouseleave",
            `${op}-positions-layer`,
            leavePositionsHoverEvent
          );
          intervals[op] = setInterval(async () => {
            await updateShapes(operator, color);
            await updatePositions(operator, color);
            console.log("Updated Positions");
          }, 60000);
        }
        // Remove shapes and positions when checkbox is unchecked
        if (!checked) {
          const index = selectedOperators.indexOf(op);
          if (index !== -1) {
            selectedOperators.splice(index, 1);
          }
          map.off(
            "mouseenter",
            `${op}-positions-layer`,
            enterPositionsHoverEvent
          );
          map.off(
            "mouseleave",
            `${op}-positions-layer`,
            leavePositionsHoverEvent
          );
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

/**
 * Show pop-up with vehicle information and highlight route when hovered
 * @param {object} e - object with information of vehicle hovered over
 */
function enterPositionsHoverEvent(e) {
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

/**
 * Hide pop-up with vehicle information and highlight route when mouse leaves
 */
function leavePositionsHoverEvent() {
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

async function getOperatorTripStops(operator, tripIds) {
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      operator: operator,
      tripIds: tripIds,
    }),
  };
  const response = await fetch("http://localhost:3000/trip-stops", options);
  const data = await response.json();
  return data;
}
