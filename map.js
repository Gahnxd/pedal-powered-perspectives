// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1IjoiZ3d1d29uZyIsImEiOiJjbTdlMXhkbTcwNDY0MmlxN2gwenh0ZGRyIn0.-CQoQm0pQ9GG9xPeNBlJmA';

const svg = d3.select('#map').select('svg'); // Selects the SVG inside the map
let stations = []; // Initializes an empty array to store station data

// Create 1440 buckets for departure and arrival times
let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

let timeFilter = -1; // Default time filter value (-1 means no filter)
let filteredTrips = [];
let filteredArrivals = new Map();
let filteredDepartures = new Map();
let filteredStations = [];

// Select elements for time slider and display
const timeSlider = document.getElementById('time-slider');
const selectedTime = document.getElementById('selected-time');
const anyTimeLabel = document.getElementById('any-time');

let stationFlow = d3.scaleQuantize()
    .domain([0, 1])
    .range([0, 0.5, 1]);


function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map', // ID of the div where the map will render
    style: 'mapbox://styles/mapbox/streets-v12',//'mapbox://styles/gwuwong/cm7e2vrf800a201so0jledu0k', // Map style
    center: [-71.09415, 42.36027], // [longitude, latitude]
    zoom: 12, // Initial zoom level
    minZoom: 5, // Minimum allowed zoom
    maxZoom: 18 // Maximum allowed zoom
});

map.on('load', () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson?...'
    });

    map.addLayer({
    id: 'bike-lanes-boston',
    type: 'line',
    source: 'boston_route',
    paint: {
        'line-color': '#1a8cff',  // A bright green using hex code
        'line-width': 5,          // Thicker lines
        'line-opacity': 0.6       // Slightly less transparent
      }
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
    id: 'bike-lanes-cambridge',
    type: 'line',
    source: 'cambridge_route',
    paint: {
        'line-color': '#1a8cff',  // A bright green using hex code
        'line-width': 5,          // Thicker lines
        'line-opacity': 0.6       // Slightly less transparent
      }
    });
});

map.on('load', () => {
    // Load the nested JSON file
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    d3.json(jsonurl).then(jsonData => {
        // console.log('Loaded JSON Data:', jsonData);  // Log to verify structure

        stations = jsonData.data.stations;
        // console.log('Stations Array:', stations);

        // Load the CSV file
        d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv').then(trips => {
            for (let trip of trips) {
                trip.started_at = new Date(trip.started_at);
                trip.ended_at = new Date(trip.ended_at);

                let startedMinutes = minutesSinceMidnight(trip.started_at);
                let endedMinutes = minutesSinceMidnight(trip.ended_at);

                departuresByMinute[startedMinutes].push(trip);
                arrivalsByMinute[endedMinutes].push(trip);
            }

            // console.log('Loaded Traffic Data:', trips); // Log to verify structure
    
            const departures = d3.rollup(
                trips,
                v => v.length,  // Count number of trips per station
                d => d.start_station_id // Group by start station
            );
            
            const arrivals = d3.rollup(
                trips,
                v => v.length,  // Count number of trips per station
                d => d.end_station_id // Group by end station
            );
    
            stations = stations.map(station => {
                let id = station.short_name;  // Get station ID
                station.arrivals = arrivals.get(id) ?? 0; // Get arrival count, default 0
                station.departures = departures.get(id) ?? 0; // Get departure count, default 0
                station.totalTraffic = station.arrivals + station.departures; // Compute total traffic
                return station;
            });
    
            console.log('Updated Stations:', stations); // Log to verify updated structure

            // Append circles to the SVG for each station
            const circles = svg.selectAll('circle')
                            .data(stations)
                            .enter()
                            .append('circle')
                            .attr('r', 5)               // Radius of the circle
                            .attr('fill', '#0073e6')  // Circle fill color
                            .attr('stroke', 'white')    // Circle border color
                            .attr('stroke-width', 1)    // Circle border thickness
                            .attr('opacity', 0.8)      // Circle opacity
                            .each(function(d) {
                                // Add <title> for browser tooltips
                                d3.select(this)
                                    .append('title')
                                    .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
                            })
                            .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));

            let radiusScale = d3.scaleSqrt()
                                .domain([0, d3.max(stations, d => d.totalTraffic)]) // Scale domain based on max traffic
                                .range([0, 25]); // Adjust range conditionally

            // Function to update circle positions when the map moves/zooms
            function updatePositions() {
                svg.selectAll('circle')
                    .attr('cx', d => getCoords(d).cx)  // Set x-position
                    .attr('cy', d => getCoords(d).cy)  // Set y-position
                    .attr('r', d => radiusScale(d.totalTraffic))  // Set size based on traffic
                    .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));
            }

            // Initial position update when map loads
            updatePositions();

            // Reposition markers on map interactions
            map.on('move', updatePositions);     // Update during map movement
            map.on('zoom', updatePositions);     // Update during zooming
            map.on('resize', updatePositions);   // Update on window resize
            map.on('moveend', updatePositions);  // Final adjustment after movement ends

            function filterByMinute(tripsByMinute, minute) {
                let minMinute = (minute - 60 + 1440) % 1440;
                let maxMinute = (minute + 60) % 1440;
            
                if (minMinute > maxMinute) {
                    return [...tripsByMinute.slice(minMinute), ...tripsByMinute.slice(0, maxMinute)];
                } else {
                    return tripsByMinute.slice(minMinute, maxMinute).flat();
                }
            }

            function filterTripsbyTime() {
                if (timeFilter === -1) {
                    filteredDepartures = departuresByMinute.reduce((acc, val) => acc.concat(val), []);
                    filteredArrivals = arrivalsByMinute.reduce((acc, val) => acc.concat(val), []);
                } else {
                    filteredDepartures = filterByMinute(departuresByMinute, timeFilter);
                    filteredArrivals = filterByMinute(arrivalsByMinute, timeFilter);
                }

                let departuresCount = new Map();
                let arrivalsCount = new Map();

                filteredDepartures.forEach(trip => {
                    departuresCount.set(trip.start_station_id, (departuresCount.get(trip.start_station_id) || 0) + 1);
                });
            
                filteredArrivals.forEach(trip => {
                    arrivalsCount.set(trip.end_station_id, (arrivalsCount.get(trip.end_station_id) || 0) + 1);
                });
            
                filteredStations = stations.map(station => {
                    let id = station.short_name;
                    station = { ...station }; // Clone to avoid modifying original
            
                    station.arrivals = departuresCount.get(id) || 0;
                    station.departures = arrivalsCount.get(id) || 0;
                    station.totalTraffic = (departuresCount.get(id) || 0) + (arrivalsCount.get(id) || 0);
            
                    return station;
                });
            
                radiusScale = d3.scaleSqrt()
                    .domain([0, d3.max(filteredStations, d => d.totalTraffic)])
                    .range(timeFilter === -1 ? [2, 25] : [2, 5]);
            
                updatePositions();
            }
            
            function formatTime(minutes) {
                const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
                return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
            }

            function updateTimeDisplay() {
                timeFilter = Number(timeSlider.value);  // Get slider value
            
                if (timeFilter === -1) {
                selectedTime.textContent = '';  // Clear time display
                anyTimeLabel.style.display = 'block';  // Show "(any time)"
                } else {
                selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
                anyTimeLabel.style.display = 'none';  // Hide "(any time)"
                }
            
                // Trigger filtering logic which will be implemented in the next step
                filterTripsbyTime();
            }

            // Update time display on slider input
            timeSlider.addEventListener('input', updateTimeDisplay);

            // Initialize time display
            updateTimeDisplay();
        }).catch(error => {
            console.error('Error loading CSV:', error); // Handle errors if CSV loading fails
        });
    }).catch(error => {
        console.error('Error loading JSON:', error);  // Handle errors if JSON loading fails
    });
});