/**
 * Type-aware field catalog — the single source of truth for the extra fields a
 * listing carries. Fixed in code, keyed by sub-category name (see CATEGORY_TREE
 * in bootstrap.js). To add, remove, rename or reorder a field, edit this file
 * and redeploy; values live in the property_fields table by field key.
 *
 *   HIGHLIGHTS   per sub-category; each listing stores a value + "show on site" flag
 *   AMENITIES    same list for every type; tick + optional value
 *   FURNISHINGS  only for furnished rentals (see furnishingsApply); optional values
 *
 * `rentOnly` / `buyOnly` limit a highlight to one search type (rent listings
 * enter maintenance in the price section instead).
 *
 * `col` marks a highlight that also feeds a legacy properties column, which the
 * listing cards and filters still read.
 */
const t = (key, label, extra) => ({ key, label, type: 'text', ...(extra || {}) });
const s = (key, label, options, extra) => ({ key, label, type: 'select', options, ...(extra || {}) });

const YES_NO = ['Yes', 'No'];
const POWER_BACKUP = ['Full', 'Partial', 'None'];
const RES_FURNISHING = ['Unfurnished', 'Semi-furnished', 'Fully furnished'];
const FACING = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'];

// shared residential pieces
const bedrooms = t('bedrooms', 'Bedrooms', { col: 'bedrooms' });
const bathrooms = t('bathrooms', 'Bathrooms', { col: 'bathrooms' });
const carpet = t('carpet', 'Carpet Area (sq ft)', { col: 'carpet_area' });
const builtup = t('builtup', 'Built-up Area (sq ft)', { col: 'builtup_area' });
const floor = t('floor', 'Floor / Total Floors', { placeholder: '5 / 12' });
const ceiling = t('ceiling_height', 'Ceiling Height (ft)', { col: 'ceiling_height' });
const powerBackup = s('power_backup', 'Power Backup', POWER_BACKUP);
const powerLoad = t('power_load_kva', 'Power Load (kVA)');
const washrooms = t('washrooms', 'Washrooms', { col: 'bathrooms' });
const cam = t('maintenance_cam', 'Maintenance / CAM (₹/sq ft)', { buyOnly: true });

const FLATS = [
  carpet, builtup, t('super_builtup', 'Super Built-up (sq ft)'),
  bedrooms, bathrooms, t('balconies', 'Balconies'), floor,
  s('furnishing', 'Furnishing', RES_FURNISHING),
  s('main_door_facing', 'Main Door Facing', FACING),
  s('balcony_facing', 'Balcony Facing', FACING),
  t('car_parking', 'Car Parking'), t('property_age', 'Age of Property'),
  t('maintenance', 'Maintenance (₹/month)', { buyOnly: true }), powerBackup,
  t('water_supply', 'Water Supply'),
  s('preferred_tenant', 'Preferred Tenant', ['Family', 'Bachelors', 'Company lease', 'Any'], { rentOnly: true }),
  s('occupancy_certificate', 'Occupancy Certificate', YES_NO),
];

const VILLAS_COMMON = [
  t('plot_area', 'Plot Area (sq ft)'), builtup, carpet, bedrooms, bathrooms,
  t('house_floors', 'Floors in the House', { col: 'total_floors' }),
  s('furnishing', 'Furnishing', RES_FURNISHING),
  s('main_door_facing', 'Main Door Facing', FACING),
  s('balcony_facing', 'Balcony Facing', FACING),
  t('garden_area', 'Garden Area (sq ft)'),
];

// Project-level details, added at the end of every type's highlights
// (the first four filled highlights stay the stat tiles on the property page).
const PROJECT = [
  t('project_name', 'Project Name', { placeholder: 'Brigade El Dorado' }),
  t('project_area', 'Project Area', { placeholder: '10 acres' }),
  t('total_towers', 'Total Towers'),
  t('total_units', 'Total Units'),
  t('unit_types', 'Unit Type', { placeholder: '2, 3 & 4 BHK' }),   // key kept from when it was "Unit Types"
  t('tower_block', 'Tower / Block', { placeholder: 'Tower B' }),
  s('registration_status', 'Registration Status', ['Registered', 'Unregistered']),
  t('address', 'Address'),
  t('landmark', 'Landmark'),
  t('project_scale', 'Project Scale'),
  t('rera_number', 'Project RERA Number'),
  t('nearest_metro', 'Nearest Metro Station', { placeholder: 'Whitefield (2 km)' }),
];

const BY_TYPE = {
  // ---------- Residential ----------
  'Flat': FLATS,
  'Pent House': [
    ...FLATS,
    t('terrace_area', 'Terrace Area (sq ft)'),
    s('levels', 'Levels', ['Simplex', 'Duplex', 'Triplex']),
    s('private_pool', 'Private Pool / Jacuzzi', YES_NO),
    s('private_lift', 'Private Lift', YES_NO),
  ],
  'Villa': [
    ...VILLAS_COMMON,
    s('private_pool', 'Private Pool', YES_NO),
    t('car_parking', 'Car Parking'),
    s('servant_quarters', 'Servant Quarters', YES_NO),
    s('gated_community', 'Gated Community', YES_NO),
    t('road_width_ft', 'Road Width (ft)'),
    s('water_source', 'Water Source', ['Municipal', 'Borewell', 'Both']),
    powerBackup, t('maintenance', 'Maintenance (₹/month)', { buyOnly: true }),
    s('occupancy_certificate', 'Occupancy Certificate', YES_NO),
  ],
  'Independent House': [
    ...VILLAS_COMMON,
    t('car_parking', 'Car Parking'),
    s('servant_quarters', 'Servant Quarters', YES_NO),
    t('road_width_ft', 'Road Width (ft)'),
    s('water_source', 'Water Source', ['Municipal', 'Borewell', 'Both']),
    powerBackup, t('maintenance', 'Maintenance (₹/month)', { buyOnly: true }),
    t('title_type', 'Khata / Title Type'),
    s('occupancy_certificate', 'Occupancy Certificate', YES_NO),
  ],
  'Independent Plot': [
    t('plot_area', 'Plot Area (sq ft)', { col: 'builtup_area' }),
    t('dimensions', 'Dimensions (ft)', { placeholder: '30 x 40' }),
    t('frontage_ft', 'Frontage (ft)'), t('road_width_ft', 'Road Width (ft)'),
    s('facing', 'Facing', FACING),
    s('corner_plot', 'Corner Plot', YES_NO),
    s('boundary_wall', 'Boundary Wall', YES_NO),
    s('gated_layout', 'Gated Layout', YES_NO),
    t('approval_authority', 'Approval Authority', { placeholder: 'BDA / BMRDA / BBMP' }),
    t('title_type', 'Khata / Title Type'),
    s('permitted_use', 'Permitted Use', ['Residential', 'Commercial', 'Mixed-use']),
    t('fsi_far', 'FSI / FAR'), t('cts_survey', 'CTS / Survey No.'),
    s('utilities', 'Water & Electricity Connection', ['Both', 'Water only', 'Electricity only', 'None']),
    s('availability', 'Availability', ['Immediate', 'Within 3 months', 'Within 6 months', 'Later']),
  ],

  // ---------- Commercial ----------
  'Office Space': [
    t('super_builtup', 'Super Built-up (sq ft)'), builtup, carpet,
    t('efficiency', 'Efficiency (%)'), floor, ceiling,
    s('furnishing', 'Furnishing', ['Bare shell', 'Warm shell', 'Furnished']),
    powerBackup, powerLoad, t('car_parking', 'Car Parking'), washrooms,
    s('air_conditioning', 'Air Conditioning', ['Central VRV', 'Split', 'None']),
    t('lifts', 'Lifts'),
    s('fire_noc', 'Fire NOC', YES_NO),
    s('occupancy_certificate', 'Occupancy Certificate', YES_NO),
    cam,
  ],
  'Retail Store': [
    carpet, builtup, t('frontage_ft', 'Frontage (ft)'),
    s('floor', 'Floor', ['Ground', 'Upper ground', 'First', 'Second', 'Higher floor']),
    s('facing', 'Facing', ['Main road', 'Internal']),
    ceiling,
    s('signage_rights', 'Signage Rights', ['Allowed', 'Not allowed']),
    t('shutter_width', 'Shutter / Entrance Width (ft)'),
    s('ideal_for', 'Ideal For', ['F&B', 'Fashion', 'Showroom', 'Bank', 'Clinic', 'Supermarket', 'Any retail']),
    s('location_type', 'Location Type', ['High-street', 'Mall', 'Standalone']),
    powerLoad, powerBackup, washrooms, cam,
  ],
  'Warehouse': [
    t('shed_builtup', 'Shed / Built-up (sq ft)', { col: 'builtup_area' }),
    t('plot_area', 'Plot / Land Area (sq ft)'),
    t('clear_height', 'Clear / Eaves Height (ft)', { col: 'ceiling_height' }),
    t('floor_load', 'Floor Load Capacity (T/sqm)'),
    t('dock_doors', 'Dock Doors'),
    s('dock_type', 'Dock Type', ['Dock-level', 'Ground-level', 'Both']),
    t('bay_spacing', 'Bay / Column Spacing (m)'),
    s('flooring', 'Flooring', ['FM2 trimix', 'Concrete', 'Epoxy', 'Other']),
    t('truck_court', 'Truck Court / Turning Radius'),
    t('ramp_access', 'Ramp Access'),
    t('office_mezz', 'Office / Mezzanine Area (sq ft)'),
    powerLoad, powerBackup,
    s('fire_sprinklers', 'Fire Safety', ['Sprinklered', 'Fire NOC', 'Both', 'None']),
    s('clu_approval', 'Approval', ['Industrial', 'CLU']),
    washrooms,
  ],
  'Land': [
    t('plot_area', 'Plot Area (sq ft)', { col: 'builtup_area' }),
    t('frontage_ft', 'Frontage (ft)'), t('road_width_ft', 'Road Width (ft)'),
    s('corner_plot', 'Corner Plot', YES_NO),
    s('permitted_use', 'Permitted Use', ['Commercial', 'Industrial', 'Mixed-use']),
    t('zoning', 'Zoning'), t('fsi_far', 'FSI / FAR'), t('facing', 'Facing'),
    t('boundary_wall', 'Boundary Wall'),
    s('land_title', 'Land Title', ['Clear', 'Freehold', 'Leasehold']),
    t('cts_survey', 'CTS / Survey No.'),
    s('availability', 'Availability', ['Immediate', 'Within 3 months', 'Within 6 months', 'Later']),
  ],
};

const HIGHLIGHTS = Object.fromEntries(Object.entries(BY_TYPE).map(([name, list]) => [name, [...list, ...PROJECT]]));

const item = (label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''), label });

const AMENITIES = [
  'Total Car Park', 'Swimming Pool', 'Gymnasium', 'Common Cafeteria', 'Lift', 'Power Nap Pods',
  '100% Power Backup', '24x7 CCTV System', 'Retreat Spa', 'Conference Room', 'Tennis Court',
  'Badminton Court', 'Snooker / Pool Room', 'Table Tennis', 'Park', 'Super Market', 'Squash',
  'Chess / Carrom Room', 'Basketball Court', 'Football', 'Cricket Court',
].map(item);

const FURNISHINGS = [
  'Fan', 'Air Conditioning', 'Geysers', 'Lights', 'Modular Kitchen', 'Chimney', 'Wardrobe',
  'Water Purifier', 'GAIL Piped Gas', 'Computer Table', 'Chairs',
].map(item);

// Furnishing values that open the Furnishings section on a rental.
const FURNISHED_VALUES = ['Semi-furnished', 'Fully furnished', 'Furnished'];
const furnishingsApply = (searchType, furnishingValue) =>
  searchType === 'Rent' && FURNISHED_VALUES.includes(furnishingValue);

const highlightsFor = (subName) => HIGHLIGHTS[subName] || [];

// Legacy properties columns kept in step with the highlights (cards + filters read them).
const SYNC_COLS = ['bedrooms', 'bathrooms', 'carpet_area', 'builtup_area', 'ceiling_height', 'floor_no', 'total_floors'];
const digits = (v) => { const d = String(v == null ? '' : v).replace(/[^0-9]/g, ''); return d === '' ? null : parseInt(d, 10); };

// highlight values {key: value} -> {column: value} for every SYNC_COLS column
function legacyColumns(subName, values) {
  const out = Object.fromEntries(SYNC_COLS.map((c) => [c, null]));
  for (const f of highlightsFor(subName)) {
    const v = (values[f.key] || '').trim();
    if (!v) continue;
    if (f.col === 'ceiling_height') out.ceiling_height = v.slice(0, 20);
    else if (f.col) out[f.col] = digits(v.split(/[.]/)[0]);
    if (f.key === 'floor' && f.type === 'text') {
      const m = v.match(/^\s*(\d+)\s*(?:\/|of)\s*(\d+)/i);
      if (m) { out.floor_no = +m[1]; out.total_floors = +m[2]; }
      else if (/^\s*\d+\s*$/.test(v)) out.floor_no = digits(v);
    }
  }
  return out;
}

// legacy column values of one property row -> highlight values {key: value} (used to backfill)
function fromLegacy(subName, row) {
  const out = {};
  for (const f of highlightsFor(subName)) {
    if (f.col && row[f.col] != null && row[f.col] !== '' && out[f.key] == null) out[f.key] = String(row[f.col]);
    if (f.key === 'floor' && f.type === 'text') {
      if (row.floor_no != null && row.total_floors) out.floor = row.floor_no + ' / ' + row.total_floors;
      else if (row.floor_no != null) out.floor = String(row.floor_no);
    }
  }
  return out;
}

module.exports = {
  HIGHLIGHTS, AMENITIES, FURNISHINGS, FURNISHED_VALUES, SYNC_COLS,
  highlightsFor, furnishingsApply, legacyColumns, fromLegacy,
};
