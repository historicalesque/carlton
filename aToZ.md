---
layout: entry
title: "Carlton A to Z"
EACCPFpath: "civic"
entry_id: "Featured-pages"
---
{% assign civic_entries = site.static_files | where_exp: "f", "f.path contains '/civic/'" | where: "extname", ".xml" | map: "basename" %}
<script id="az-entries" type="application/json">{{ civic_entries | jsonify }}</script>
<script src="scripts/az-status.js?v={{ site.time | date: '%s' }}"></script>
