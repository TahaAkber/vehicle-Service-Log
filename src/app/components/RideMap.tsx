import { StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import type { CommutePlace, RoutePoint } from "../data/rideTracker";

const buildMapHtml = (
  route: RoutePoint[],
  home?: CommutePlace,
  work?: CommutePlace,
  selectedLocation?: Pick<CommutePlace, "latitude" | "longitude">,
  selectable = false,
) => {
  const routeJson = JSON.stringify(route.map(({ latitude, longitude }) => [latitude, longitude]));
  const homeJson = JSON.stringify(home ?? null);
  const workJson = JSON.stringify(work ?? null);
  const selectedJson = JSON.stringify(selectedLocation ?? null);
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;background:#0b1220}.leaflet-control-attribution{font-size:8px;background:rgba(7,12,24,.72)!important;color:#9aa8bc}.leaflet-control-attribution a{color:#52d6ff}</style>
</head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const route=${routeJson},home=${homeJson},work=${workJson},selected=${selectedJson},selectable=${selectable};
const map=L.map('map',{zoomControl:false,attributionControl:true});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
const bounds=[];
if(route.length){L.polyline(route,{color:'#52D6FF',weight:5,opacity:.95}).addTo(map);route.forEach(p=>bounds.push(p));L.circleMarker(route[0],{radius:6,color:'#36D399',fillOpacity:1}).addTo(map);L.circleMarker(route[route.length-1],{radius:6,color:'#FFB84D',fillOpacity:1}).addTo(map)}
function placeMarker(place,label,color){if(!place)return;const point=[place.latitude,place.longitude];bounds.push(point);L.circleMarker(point,{radius:8,color,weight:3,fillColor:'#111827',fillOpacity:1}).addTo(map).bindTooltip(label)}
placeMarker(home,'Home','#36D399');placeMarker(work,'Work','#FFB84D');
if(selected){const point=[selected.latitude,selected.longitude];bounds.push(point);L.circleMarker(point,{radius:11,color:'#FFFFFF',weight:3,fillColor:'#3182F6',fillOpacity:1}).addTo(map).bindTooltip('Selected location',{permanent:true,direction:'top',offset:[0,-12]})}
if(selectable){map.on('click',function(event){window.ReactNativeWebView.postMessage(JSON.stringify({type:'map-press',latitude:event.latlng.lat,longitude:event.latlng.lng}))})}
if(bounds.length>1)map.fitBounds(bounds,{padding:[28,28],maxZoom:16});else if(bounds.length===1)map.setView(bounds[0],15);else map.setView([30.3753,69.3451],5);
</script></body></html>`;
};

export default function RideMap({
  route,
  home,
  work,
  selectedLocation,
  selectable = false,
  onLocationSelect,
}: {
  route: RoutePoint[];
  home?: CommutePlace;
  work?: CommutePlace;
  selectedLocation?: Pick<CommutePlace, "latitude" | "longitude">;
  selectable?: boolean;
  onLocationSelect?: (coordinates: { latitude: number; longitude: number }) => void;
}) {
  const lastTimestamp = route[route.length - 1]?.timestamp ?? 0;
  return (
    <View style={styles.frame}>
      <WebView
        key={`${route.length}-${lastTimestamp}-${home?.latitude ?? ""}-${work?.latitude ?? ""}-${selectedLocation?.latitude ?? ""}-${selectedLocation?.longitude ?? ""}-${selectable}`}
        source={{ html: buildMapHtml(route, home, work, selectedLocation, selectable) }}
        originWhitelist={["*"]}
        style={styles.map}
        nestedScrollEnabled
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="never"
        onMessage={(event) => {
          if (!selectable || !onLocationSelect) return;
          try {
            const message = JSON.parse(event.nativeEvent.data) as {
              type?: string;
              latitude?: number;
              longitude?: number;
            };
            if (
              message.type === "map-press" &&
              Number.isFinite(message.latitude) &&
              Number.isFinite(message.longitude)
            ) {
              onLocationSelect({
                latitude: message.latitude as number,
                longitude: message.longitude as number,
              });
            }
          } catch {
            // Ignore non-map WebView messages.
          }
        }}
      />
      {selectable ? <View pointerEvents="none" style={styles.tapHint}><Text style={styles.tapHintText}>Tap anywhere to place the pin</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 270,
    overflow: "hidden",
    borderRadius: 22,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "#243047",
  },
  map: { flex: 1, backgroundColor: "#0B1220" },
  tapHint: { position: "absolute", top: 10, alignSelf: "center", paddingHorizontal: 11, paddingVertical: 7, borderRadius: 12, backgroundColor: "rgba(7,12,24,0.86)" },
  tapHintText: { color: "#FFFFFF", fontSize: 9, fontWeight: "800" },
});
