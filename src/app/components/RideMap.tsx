import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import type { CommutePlace, RoutePoint } from "../data/rideTracker";

const buildMapHtml = (route: RoutePoint[], home?: CommutePlace, work?: CommutePlace) => {
  const routeJson = JSON.stringify(route.map(({ latitude, longitude }) => [latitude, longitude]));
  const homeJson = JSON.stringify(home ?? null);
  const workJson = JSON.stringify(work ?? null);
  return `<!doctype html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>html,body,#map{height:100%;margin:0;background:#0b1220}.leaflet-control-attribution{font-size:8px;background:rgba(7,12,24,.72)!important;color:#9aa8bc}.leaflet-control-attribution a{color:#52d6ff}</style>
</head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
const route=${routeJson},home=${homeJson},work=${workJson};
const map=L.map('map',{zoomControl:false,attributionControl:true});
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:20,attribution:'&copy; OpenStreetMap &copy; CARTO'}).addTo(map);
const bounds=[];
if(route.length){L.polyline(route,{color:'#52D6FF',weight:5,opacity:.95}).addTo(map);route.forEach(p=>bounds.push(p));L.circleMarker(route[0],{radius:6,color:'#36D399',fillOpacity:1}).addTo(map);L.circleMarker(route[route.length-1],{radius:6,color:'#FFB84D',fillOpacity:1}).addTo(map)}
function placeMarker(place,label,color){if(!place)return;const point=[place.latitude,place.longitude];bounds.push(point);L.circleMarker(point,{radius:8,color,weight:3,fillColor:'#111827',fillOpacity:1}).addTo(map).bindTooltip(label)}
placeMarker(home,'Home','#36D399');placeMarker(work,'Work','#FFB84D');
if(bounds.length>1)map.fitBounds(bounds,{padding:[28,28],maxZoom:16});else if(bounds.length===1)map.setView(bounds[0],15);else map.setView([30.3753,69.3451],5);
</script></body></html>`;
};

export default function RideMap({
  route,
  home,
  work,
}: {
  route: RoutePoint[];
  home?: CommutePlace;
  work?: CommutePlace;
}) {
  const lastTimestamp = route[route.length - 1]?.timestamp ?? 0;
  return (
    <View style={styles.frame}>
      <WebView
        key={`${route.length}-${lastTimestamp}-${home?.latitude ?? ""}-${work?.latitude ?? ""}`}
        source={{ html: buildMapHtml(route, home, work) }}
        originWhitelist={["*"]}
        style={styles.map}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        mixedContentMode="never"
      />
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
});
