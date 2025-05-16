import './style.css';
import { GoogleGenerativeAI } from '@google/generative-ai';
import L from 'leaflet';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// Initialize Supabase client
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);
let map;
let loadingState = false;

function setLoading(state) {
  loadingState = state;
  const loader = document.getElementById('loader');
  const content = document.getElementById('content');
  
  if (state) {
    loader.classList.remove('hidden');
    content.classList.add('opacity-50');
  } else {
    loader.classList.add('hidden');
    content.classList.remove('opacity-50');
  }
}

function handleError(message, error) {
  console.error(error);
  const errorDiv = document.getElementById('error-message');
  errorDiv.textContent = message;
  errorDiv.classList.remove('hidden');
  setTimeout(() => {
    errorDiv.classList.add('hidden');
  }, 5000);
}

async function fetchRecyclingPoints(lat, lng) {
  try {
    const [pointsData, machinesData] = await Promise.all([
      supabase
        .rpc('nearby_points', { 
          user_lat: lat,
          user_lng: lng,
          radius_km: 5
        }),
      supabase
        .rpc('nearby_machines', {
          user_lat: lat,
          user_lng: lng,
          radius_km: 5
        })
    ]);

    if (pointsData.error) throw pointsData.error;
    if (machinesData.error) throw machinesData.error;

    const points = pointsData.data.map(point => {
      const machines = machinesData.data.filter(m => m.location_id === point.id);
      return {
        ...point,
        machines: machines.map(m => ({
          id: m.machine_id,
          type: m.machine_type,
          status: m.status,
          capacity: m.capacity
        }))
      };
    });

    return points;
  } catch (error) {
    handleError('Failed to fetch recycling points', error);
    return [];
  }
}

async function detectObjects(imageElement) {
  try {
    setLoading(true);
    
    // Convert image to base64
    const canvas = document.createElement('canvas');
    canvas.width = imageElement.width;
    canvas.height = imageElement.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageElement, 0, 0);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

    // Create Gemini vision model with updated model name
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `Analyze this image for recyclable items, focusing on plastic bottles and containers. Please provide a clear analysis in the following format:

1. Item Identification: [Describe what you see]
2. Recycling Details:
   - Material Type: [Specify material and recycling code if visible]
   - Preparation Steps: [List steps like rinsing, removing caps, etc.]
   - Recycling Instructions: [Provide specific recycling guidance]
3. Environmental Impact: [Brief note on recycling benefits]

If no recyclable items are detected, simply state that fact.`;
    
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Image
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();

    const resultDiv = document.getElementById('result');
    const detectionResult = document.getElementById('detection-result');
    
    resultDiv.classList.remove('hidden');
    
    if (text.toLowerCase().includes('bottle') || text.toLowerCase().includes('plastic')) {
      // Format the response text by replacing line breaks with HTML
      const formattedText = text
        .split('\n')
        .map(line => {
          if (line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.')) {
            return `<h3 class="font-semibold mt-3">${line}</h3>`;
          } else if (line.startsWith('-')) {
            return `<li class="ml-4">${line.substring(1)}</li>`;
          }
          return `<p>${line}</p>`;
        })
        .join('');

      detectionResult.innerHTML = `
        <div class="text-green-600">
          <p class="text-xl font-semibold">✅ Recyclable Item Detected</p>
          <div class="mt-4 p-4 bg-green-50 rounded-lg text-gray-700">
            ${formattedText}
          </div>
        </div>
      `;
      updateNearbyLocations();
    } else {
      detectionResult.innerHTML = `
        <div class="text-red-600">
          <p class="text-xl font-semibold">❌ No recyclable bottle detected</p>
          <p class="text-sm mt-2">Please try again with a clear image of a recyclable bottle</p>
        </div>
      `;
    }
  } catch (error) {
    handleError('Error during object detection', error);
  } finally {
    setLoading(false);
  }
}

function getStatusColor(status) {
  const colors = {
    'operational': 'bg-green-500',
    'maintenance': 'bg-yellow-500',
    'offline': 'bg-red-500'
  };
  return colors[status] || 'bg-gray-500';
}

function initMap(lat, lng) {
  try {
    map = L.map('map').setView([lat, lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
  } catch (error) {
    handleError('Failed to initialize map', error);
  }
}

async function updateNearbyLocations() {
  if ('geolocation' in navigator) {
    try {
      setLoading(true);
      
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject);
      });
      
      const { latitude, longitude } = position.coords;
      
      if (!map) {
        initMap(latitude, longitude);
      }
      
      // Clear existing markers
      map.eachLayer((layer) => {
        if (layer instanceof L.Marker) {
          map.removeLayer(layer);
        }
      });
      
      // Add user location marker
      const userIcon = L.divIcon({
        html: '📍',
        className: 'text-2xl',
        iconSize: [20, 20],
        iconAnchor: [10, 20],
      });

      L.marker([latitude, longitude], { icon: userIcon })
        .addTo(map)
        .bindPopup('<strong>Your Location</strong>')
        .openPopup();
      
      // Fetch and display recycling points with machine status
      const recyclingPoints = await fetchRecyclingPoints(latitude, longitude);
      
      recyclingPoints.forEach(point => {
        const recycleIcon = L.divIcon({
          html: '♻️',
          className: 'text-2xl',
          iconSize: [20, 20],
          iconAnchor: [10, 20],
        });

        const machineStatus = point.machines.map(machine => `
          <div class="flex items-center gap-2 mt-1">
            <span class="w-2 h-2 rounded-full ${getStatusColor(machine.status)}"></span>
            <span>${machine.type}: ${machine.status} (${machine.capacity}% full)</span>
          </div>
        `).join('');

        L.marker([point.latitude, point.longitude], { icon: recycleIcon })
          .addTo(map)
          .bindPopup(`
            <strong>${point.name}</strong><br>
            ${point.type}<br>
            Operating Hours: ${point.operating_hours}<br>
            Phone: ${point.phone}<br>
            <div class="mt-2">
              <strong>Recycling Machines:</strong>
              ${machineStatus || '<div class="mt-1">No machines available</div>'}
            </div>
          `);
      });
      
      // Update locations list
      const locationsList = document.getElementById('locations-list');
      locationsList.innerHTML = recyclingPoints
        .map(point => `
          <li class="p-4 bg-green-50 rounded-lg hover:bg-green-100 transition-colors duration-200">
            <div class="flex items-center justify-between">
              <div>
                <h3 class="font-semibold text-green-800">${point.name}</h3>
                <p class="text-gray-600">${point.type}</p>
                <p class="text-sm text-gray-500">
                  Operating Hours: ${point.operating_hours}<br>
                  Phone: ${point.phone}<br>
                  Distance: ${point.distance}km
                </p>
                ${point.machines.length > 0 ? `
                  <div class="mt-2">
                    <p class="font-medium text-gray-700">Recycling Machines:</p>
                    ${point.machines.map(machine => `
                      <div class="flex items-center gap-2 mt-1">
                        <span class="w-2 h-2 rounded-full ${getStatusColor(machine.status)}"></span>
                        <span>${machine.type}: ${machine.status} (${machine.capacity}% full)</span>
                      </div>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
              <button class="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors duration-200"
                onclick="window.open('https://maps.google.com/?q=${point.latitude},${point.longitude}', '_blank')">
                Directions
              </button>
            </div>
          </li>
        `)
        .join('');
    } catch (error) {
      handleError('Error updating locations', error);
    } finally {
      setLoading(false);
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const imageInput = document.getElementById('imageInput');
    const canvas = document.getElementById('canvas');
    
    imageInput.addEventListener('change', async (e) => {
      try {
        const file = e.target.files[0];
        if (file) {
          setLoading(true);
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            detectObjects(img);
          };
          img.src = URL.createObjectURL(file);
        }
      } catch (error) {
        handleError('Error processing image', error);
      }
    });
  } catch (error) {
    handleError('Error initializing application', error);
  }
});