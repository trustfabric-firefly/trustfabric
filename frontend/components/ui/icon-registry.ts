"use client";

import { addCollection } from "@iconify/react";
import streamlineFlex from "@iconify-json/streamline-flex/icons.json";
import simpleIcons from "@iconify-json/simple-icons/icons.json";

let registered = false;

/** Bundle icon JSON locally so icons work offline and avoid CDN round-trips. */
export function registerIconCollections() {
    if (registered) return;
    addCollection(streamlineFlex);
    addCollection(simpleIcons);
    registered = true;
}
