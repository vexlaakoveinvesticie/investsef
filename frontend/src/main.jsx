import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

/* ---------------------------------------------------------------
   Shim pre window.storage
   Komponent bol pôvodne vytvorený ako Claude artifact, ktorý má
   k dispozícii window.storage API. Mimo Claude toto API neexistuje,
   preto ho tu nahrádzame implementáciou nad localStorage, aby
   ukladanie journalu, portfólia a obchodov fungovalo aj lokálne.
   --------------------------------------------------------------- */
if (!window.storage) {
  const PREFIX = "aitt:";
  window.storage = {
    async get(key) {
      const value = localStorage.getItem(PREFIX + key);
      if (value === null) throw new Error("Key not found: " + key);
      return { key, value, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(PREFIX + key, value);
      return { key, value, shared: false };
    },
    async delete(key) {
      localStorage.removeItem(PREFIX + key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix = "") {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith(PREFIX + prefix)) keys.push(k.slice(PREFIX.length));
      }
      return { keys, prefix, shared: false };
    },
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
