mapboxgl.accessToken =
  "pk.eyJ1IjoidGF0c3VtaXRhZ2F3YSIsImEiOiJjaWYwN2U1cjgwMHM2czVsdXZhMWRjbG5hIn0.afavIGCyZMveyGQG9jy3GA";
const map = new mapboxgl.Map({
  container: "map", // container ID
  style: "mapbox://styles/mapbox/light-v10", // style URL
  center: [-122.27596124368328, 37.73017438365425], // starting position [lng, lat]
  zoom: 9.4, // starting zoom
});

// Currently selected operators to show on map
const selectedOperators = [];

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
  try {
    await createMenu();
    await updateMenu();
  } catch (error) {
    console.error(error);
  }
  setInterval(() => {
    try {
      updateMenu();
    } catch (error) {
      console.error(error);
    }
  }, 60000);
});

/**
 * Get specified operator information
 * @param {string} operator - operator's code name
 * @returns {object}
 */
async function getOperator(operator) {
  try {
    const response = await fetch(
      `http://localhost:3000/operator?operator=${operator}`
    );
    const data = await response.json();
    return data[0];
  } catch (error) {
    console.error(error);
  }
}

/**
 * Get all operator information
 * @param {string}
 * @returns {object}
 */
async function getOperators() {
  try {
    const response = await fetch(`http://localhost:3000/operators`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Returns array of operators that are currently active
 * @returns array
 */
async function getActiveOperators() {
  try {
    const response = await fetch(`http://localhost:3000/active-operators`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Retrieve current vehicle positions and update to GeoJSON
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
    console.error(error);
  }
}

/**
 * Create and add vehicle position and route layers for
 * specified operator.
 * @param {object} map Object
 * @param {string} operator - operator code name
 * @param {string} color - hex color value
 */
async function updatePositions(operator, color) {
  try {
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
      map
        .getSource(`${operator}-positions`)
        .setData(positionsFeatureCollection);
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
  } catch (error) {
    console.error(error);
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
  try {
    const response = await fetch("http://localhost:3000/shapes", options);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Return all transit stations on active lines for operator
 * @param {string} operator
 * @param {array} tripIds
 * @returns array
 */
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
  try {
    const response = await fetch("http://localhost:3000/trip-stops", options);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error(error);
  }
}

/**
 * Update shapes on map
 * @param {string} operator - operator code name
 * @param {string} color - hex color code
 */
async function updateShapesAndTripStops(operator, color) {
  try {
    const positions = await getPositions(operator);
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
    };

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

      // Only create feature if shape / coordinates exists
      if (coordinates) {
        shapesFeatureCollection.features.push(
          turf.lineString(coordinates, properties, options)
        );
      }
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

    // Create GeoJSON of trip stops (stations)
    const tripStops = await getOperatorTripStops(operator, tripIds);
    for (const tripStop of tripStops) {
      const coordinates = [tripStop.stop_lon, tripStop.stop_lat];
      tripStopsFeatureCollection.features.push({
        type: "Feature",
        properties: {
          stopName: tripStop.stop_name,
        },
        geometry: {
          type: "Point",
          coordinates: coordinates,
        },
      });
    }
    // Remove operator trip-stops source and layers if all vehicle's are inactive
    if (
      !Object.keys(tripStops).length &&
      map.getSource(`${operator}-trip-stops`)
    ) {
      map.removeLayer(`${operator}-trip-stops-layer`);
      map.removeSource(`${operator}-trip-stops`);
      console.log(`Removed ${operator}-trip-stops source`);
    }
    // Update trip-stops to add/remove active/inactive transit routes
    else if (map.getSource(`${operator}-trip-stops`)) {
      map
        .getSource(`${operator}-trip-stops`)
        .setData(tripStopsFeatureCollection);
    }
    // Create source and layer and plot trip-stops
    else if (
      tripStopsFeatureCollection.features.length &&
      Object.keys(tripStops).length
    ) {
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
          "circle-radius": {
            stops: [
              [9, 0.75],
              [16, 6],
            ],
          },
          "circle-stroke-width": 1,
          "circle-stroke-color": "#000",
        },
      });
    }
  } catch (error) {
    console.error(error);
  }
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
    const allOperators = await getOperators();
    const allOperatorsSorted = allOperators.sort((a, b) => {
      if (a.common_name > b.common_name) return 1;
      if (a.common_name < b.common_name) return -1;
      return 0;
    });

    // Create checkbox of all operators
    for (const operator of allOperatorsSorted) {
      const color = operator.color;
      const commonName = operator.common_name;
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      let operatorId = operator.id;
      checkbox.type = "checkbox";
      checkbox.value = operatorId;
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(commonName));
      const div = document.createElement("div");
      if (operatorId === "3D") {
        operatorId = "three-d";
      }
      div.setAttribute("class", operatorId);
      div.style.display = "none";
      form.appendChild(div);
      div.appendChild(label);

      label.addEventListener("change", async (e) => {
        const checked = e.target.checked;
        const op = e.target.value;
        // Add shapes and positions when checkbox is checked
        if (checked) {
          selectedOperators.push(op);
          checkbox.disabled = true;
          await updateShapesAndTripStops(op, color);
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
          map.on(
            "mouseenter",
            `${op}-trip-stops-layer`,
            enterTripStopsHoverEvent
          );
          map.on(
            "mouseleave",
            `${op}-trip-stops-layer`,
            leaveTripStopHoverEvent
          );
          intervals[op] = setInterval(async () => {
            await updateShapesAndTripStops(operatorId, color);
            await updatePositions(operatorId, color);
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
          map.off(
            "mouseenter",
            `${op}-trip-stops-layer`,
            enterTripStopsHoverEvent
          );
          map.off(
            "mouseleave",
            `${op}-trip-stops-layer`,
            leaveTripStopHoverEvent
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
          if (map.getSource(`${op}-shapes`)) {
            map.removeLayer(`${op}-shapes-layer`);
            map.removeSource(`${op}-shapes`);
          }
          if (map.getSource(`${op}-trip-stops`)) {
            map.removeLayer(`${op}-trip-stops-layer`);
            map.removeSource(`${op}-trip-stops`);
          }
        }
      });
    }
  } catch (error) {
    console.error(error);
  }
}

/**
 * Update list of operators to show/remove operators which became active/inactive
 */
async function updateMenu() {
  try {
    const allOperators = await getOperators();
    const activeOperators = await getActiveOperators();
    const nonActiveOperators = allOperators.filter((operator) => {
      return !activeOperators.some((active) => {
        return operator.id === active.id;
      });
    });

    for (const active of activeOperators) {
      let operatorId = active.id;
      if (operatorId === "3D") {
        operatorId = "three-d";
      }
      const operatorEl = document.querySelector(`.${operatorId}`);
      operatorEl.style.display = "block";
    }

    for (const nonActive of nonActiveOperators) {
      let operatorId = nonActive.id;
      if (operatorId === "3D") {
        operatorId = "three-d";
      }
      const operatorEl = document.querySelector(`.${operatorId}`);
      operatorEl.style.display = "none";
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
 * remove pop-up with vehicle information and highlighted route when mouse leaves
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

/**
 * Show transit station name when hovered over
 * @param {event} e
 */
function enterTripStopsHoverEvent(e) {
  map.getCanvas().style.cursor = "pointer";
  const properties = e.features[0].properties;
  const stopName = properties.stopName;
  const coordinates = [e.lngLat.lng, e.lngLat.lat];
  popup
    .setLngLat(coordinates)
    .setHTML(`<strong>${stopName}</strong>`)
    .addTo(map);
}

/**
 * Remove transit station name when mouse leaves
 */
function leaveTripStopHoverEvent() {
  map.getCanvas().style.cursor = "";
  popup.remove();
}
