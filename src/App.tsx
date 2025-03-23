import React, { useState, useEffect, useRef } from 'react';
import * as duckdb from '@duckdb/duckdb-wasm';
import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import maplibregl from 'maplibre-gl';
import FilterOverlay from './FilterOverlay';
import styleJson from "./assets/style.json";
import { Protocol } from "pmtiles";
import { cellToBoundary } from 'h3-js';


type CategoryFiltersType = {
  [category: string]: string[];
};

type NumericFilterRangeType = {
  min: number | null;
  max: number | null;
};

type NumericFiltersType = {
  [field: string]: NumericFilterRangeType;
};

interface HoverData {
  count: number;
  totalCount: number;
}

const initialH3Resolution = 11;
const initialOpacity = 1.0;
const initialHeightMultiplier = 1.0;

const h3CellToGeometry = (h3CellId: string) => {
  const boundary = cellToBoundary(h3CellId);
  const geoJsonPolygon = {
    type: "Polygon",
    coordinates: [
      boundary.map(([lat, lng]) => [lng, lat]),
    ],
  };

  return geoJsonPolygon;
};

const getBlueColor = (ratio: number): string => {
  const validRatio = Math.max(0, Math.min(1, ratio));
  const lightness = 90 - (validRatio * 60);
  return `hsl(210, 100%, ${lightness}%)`;
};

function addColorLegend(
  map: any,
  options: {
    title?: string;
    position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
    width?: number;
    height?: number;
    margin?: number;
    steps?: number;
    opacity?: number;
  } = {}
): void {
  const {
    title = 'Ratio',
    position = 'bottom-right',
    width = 200,
    height = 30,
    margin = 10,
    steps = 100,
    opacity = 0.9
  } = options;

  const legendContainer = document.createElement('div');
  legendContainer.className = 'maplibre-legend';
  legendContainer.style.position = 'absolute';
  legendContainer.style.zIndex = '10';
  legendContainer.style.background = 'white';
  legendContainer.style.padding = '10px';
  legendContainer.style.borderRadius = '4px';
  legendContainer.style.boxShadow = '0 1px 5px rgba(0, 0, 0, 0.2)';

  switch (position) {
    case 'top-left':
      legendContainer.style.top = `${margin}px`;
      legendContainer.style.left = `${margin}px`;
      break;
    case 'top-right':
      legendContainer.style.top = `${margin}px`;
      legendContainer.style.right = `${margin}px`;
      break;
    case 'bottom-left':
      legendContainer.style.bottom = `${margin}px`;
      legendContainer.style.left = `${margin}px`;
      break;
    case 'bottom-right':
      legendContainer.style.bottom = `${margin}px`;
      legendContainer.style.right = `${margin}px`;
      break;
  }

  if (title) {
    const titleElement = document.createElement('div');
    titleElement.style.fontWeight = 'bold';
    titleElement.style.marginBottom = '5px';
    titleElement.textContent = title;
    legendContainer.appendChild(titleElement);
  }

  const colorScale = document.createElement('div');
  colorScale.style.width = `${width}px`;
  colorScale.style.height = `${height}px`;
  colorScale.style.backgroundImage = createGradient(steps);
  colorScale.style.borderRadius = '2px';
  colorScale.style.opacity = opacity.toString();
  legendContainer.appendChild(colorScale);

  const labelsContainer = document.createElement('div');
  labelsContainer.style.display = 'flex';
  labelsContainer.style.justifyContent = 'space-between';
  labelsContainer.style.marginTop = '5px';

  const minLabel = document.createElement('div');
  minLabel.textContent = '0%';
  minLabel.style.fontSize = '12px';

  const maxLabel = document.createElement('div');
  maxLabel.textContent = '100%';
  maxLabel.style.fontSize = '12px';

  labelsContainer.appendChild(minLabel);
  labelsContainer.appendChild(maxLabel);
  legendContainer.appendChild(labelsContainer);

  map.getContainer().appendChild(legendContainer);
}

function createGradient(steps: number): string {
  const gradientStops: string[] = [];

  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const color = getBlueColor(ratio);
    gradientStops.push(`${color} ${ratio * 100}%`);
  }

  return `linear-gradient(to right, ${gradientStops.join(', ')})`;
}

const App: React.FC = () => {
  const [db, setDb] = useState<AsyncDuckDB | null>(null);
  const [isDbReady, setIsDbReady] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [tableName, setTableName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [cols, setCols] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Record<string, string[]>>({});

  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [categoryFilters, setCategoryFilters] = useState<CategoryFiltersType>(categories);

  const [numericFilters, setNumericFilters] = useState<NumericFiltersType>({});

  const [, setActiveFilterCategories] = useState<CategoryFiltersType>(categoryFilters);
  const [, setActiveNumericFilters] = useState<NumericFiltersType>(numericFilters);

  const [hoverData, setHoverData] = useState<HoverData | null>(null);

  // Handle filter changes
  const handleFilterChange = (
    newCategoryFilters: CategoryFiltersType,
    newNumericFilters: NumericFiltersType,
    h3Resolution: number,
    opacity: number,
    heightMultiplier: number,
  ): void => {
    setActiveFilterCategories(newCategoryFilters);
    setActiveNumericFilters(newNumericFilters);
    applyFiltersToMap(newCategoryFilters, newNumericFilters, h3Resolution, opacity, heightMultiplier);
  };

  const applyFiltersToMap = (
    categoryFilterCriteria: CategoryFiltersType,
    numericFilterCriteria: NumericFiltersType,
    h3Resolution: number,
    opacity: number,
    heightMultiplier: number,
  ): void => {

    const query = async () => {

      if (!isDbReady || !db || !tableName) {
        setError('Database or table not ready.');
        return;
      }
      const conn = await db.connect();

      function generateSQLFilterStatement(
        categoryFilters: CategoryFiltersType,
        numericFilters: NumericFiltersType
      ): string {
        const conditions: string[] = [];

        for (const category in categoryFilters) {
          if (categoryFilters[category].length > 0) {
            const quotedValues = categoryFilters[category].map(value => `'${value}'`).join(', ');
            conditions.push(`${category} IN (${quotedValues})`);
          }
        }

        for (const field in numericFilters) {
          const { min, max } = numericFilters[field];

          if (min !== null) {
            conditions.push(`${field} >= ${min}`);
          }

          if (max !== null) {
            conditions.push(`${field} <= ${max}`);
          }
        }

        if (conditions.length === 0) {
          return "";
        }

        return `FILTER (WHERE ${conditions.join(' AND ')})`;
      }

      const filtersString = generateSQLFilterStatement(categoryFilterCriteria, numericFilterCriteria);

      const sql = `
        INSTALL h3 FROM community;
        LOAD h3;
                                                        
        SELECT 
            h3_latlng_to_cell(lat, lon, ${h3Resolution}) AS h3_cell, 
            COUNT(*) ${filtersString} AS count,
            COUNT(*) AS total_count
        FROM ${tableName}
        GROUP BY h3_cell
        ORDER BY total_count DESC;
      `;

      const result = await conn.query(sql);

      const featureCollection = {
        'type': 'FeatureCollection',
        'features': [] as any
      }

      for (let i = 0; i < result.numRows; i++) {
        const h3Cell = result.getChildAt(0)?.get(i).toString(16);
        const count = Number(result.getChildAt(1)?.get(i));
        const totalCount = Number(result.getChildAt(2)?.get(i));

        const feature = {
          'type': 'Feature',
          'properties': {
            'count': count,
            'totalCount': totalCount,
            'color': getBlueColor(count / totalCount),
            'h3Cell': h3Cell
          },
          'geometry': h3CellToGeometry(h3Cell)
        }
        featureCollection['features'].push(feature);
      }

      const coordinates = featureCollection.features.flatMap((feature: any) => {
        return feature.geometry.type === "Point"
          ? [feature.geometry.coordinates]
          : feature.geometry.coordinates[0];
      });

      const map = mapRef.current;
      if (map) {
        if (!map.getSource('h3')) {
          map.addSource('h3', {
            type: 'geojson',
            data: featureCollection as any
          })
        }
        else {
          const source: any = map.getSource('h3');
          source.setData(featureCollection);
        }

        if (!showFilters) {
          const bounds = coordinates.reduce(
            (bounds: maplibregl.LngLatBounds, coord: [number, number]) => {
              return bounds.extend(coord);
            },
            new maplibregl.LngLatBounds()
          );
          map.fitBounds(bounds, { padding: 50 });
        }
        const layers: string[] = ["h3", "h3-hover"];
        for (const layer of layers) {
          map.setPaintProperty(layer, 'fill-extrusion-opacity', opacity);
          map.setPaintProperty(layer, 'fill-extrusion-height', ['*', heightMultiplier, ['get', 'count']]);
        }

      }

      setShowFilters(true);

      await conn.close();
    }
    query();
  };

  const toggleFilters = (): void => {
    setShowFilters(!showFilters);
  };

  useEffect(() => {
    const initDb = async () => {
      try {
        setIsLoading(true);

        const CDN_BUNDLES = duckdb.getJsDelivrBundles();
        const bundle = await duckdb.selectBundle(CDN_BUNDLES);
        const worker_url = URL.createObjectURL(
          new Blob([`importScripts("${bundle.mainWorker}");`], {
            type: "text/javascript"
          })
        );

        const worker = new Worker(worker_url);
        const logger = new duckdb.ConsoleLogger("DEBUG" as any);
        const db = new duckdb.AsyncDuckDB(logger, worker);

        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        URL.revokeObjectURL(worker_url);

        setDb(db);
        setIsDbReady(true);
        setIsLoading(false);
      } catch (err) {
        console.error('Failed to initialize DuckDB:', err);
        setError(`Failed to initialize DuckDB: ${err instanceof Error ? err.message : String(err)}`);
        setIsLoading(false);
      }
    };

    initDb();

    return () => {
      if (db) {
        db.terminate();
      }
    };
  }, []);


  useEffect(() => {
    if (mapContainerRef.current && !mapRef.current) {
      let protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);

      mapRef.current = new maplibregl.Map({
        container: mapContainerRef.current,
        style: styleJson as any,
        center: [8, 47],
        zoom: 5,
        hash: 'map'
      });

      const map = mapRef.current;
      if (!map) {
        return;
      }

      mapRef.current.on('load', function () {
        if (!map.getSource('h3')) {
          map.addSource('h3', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: []
            }
          })
        }
        map.addLayer({
          id: 'h3',
          source: 'h3',
          type: 'fill-extrusion',
          paint: {
            'fill-extrusion-color': ['get', 'color'],
            'fill-extrusion-height': ['*', initialHeightMultiplier, ['get', 'count']]
          }
        })

        if (!map.getSource('h3-hover')) {
          map.addSource('h3-hover', {
            type: 'geojson',
            data: {
              type: 'FeatureCollection',
              features: []
            }
          })
        }
        map.addLayer({
          id: 'h3-hover',
          source: 'h3-hover',
          type: 'fill-extrusion',
          paint: {
            'fill-extrusion-color': '#FF9900',
            'fill-extrusion-height': ['*', initialHeightMultiplier, ['get', 'count']]
          }
        });

        addColorLegend(map, {
          title: 'H3 Cell Ratio',
          position: 'bottom-left',
          width: 250,
          height: 20
        });
      });

      map.on('mousemove', 'h3', (e) => {
        if (e.features && e.features.length > 0) {
          map.getCanvas().style.cursor = 'pointer';
          const feature = e.features[0];
          setHoverData({
            count: feature.properties.count,
            totalCount: feature.properties.totalCount,
          });
          const source: any = map.getSource('h3-hover');
          if (source) {
            source.setData({
              'type': 'FeatureCollection',
              'features': [
                {
                  'type': 'Feature',
                  'properties': {
                    count: feature.properties.count,
                    totalCount: feature.properties.totalCount,
                  },
                  'geometry': h3CellToGeometry(feature.properties.h3Cell),
                }
              ]
            });
          }

        }
      });

      map.on('mouseleave', 'h3', () => {
        map.getCanvas().style.cursor = '';
        const source: any = map.getSource('h3-hover');
        if (source) {
          source.setData({
            'type': 'FeatureCollection',
            'features': []
          });
        }
      });
    }
  }, [mapContainerRef.current]);

  useEffect(() => {
    if (Object.keys(cols).length === 0) {
      return;
    }
    const query = async () => {

      if (!isDbReady || !db || !tableName) {
        setError('Database or table not ready.');
        return;
      }
      const conn = await db.connect();

      const categoriesTmp: Record<string, string[]> = {};
      for (const colName in cols) {
        if (cols[colName] !== 'Utf8') {
          continue;
        }
        const sql = `
          SELECT DISTINCT ${colName} FROM ${tableName};
        `;
        const result = await conn.query(sql);
        categoriesTmp[colName] = [];
        for (let i = 0; i < result.numRows; i++) {
          categoriesTmp[colName].push(result.getChildAt(0)?.get(i));
        }
      }
      setCategories(categoriesTmp);

      await conn.close();
    }
    query();
  }, [cols]);

  useEffect(() => {
    if (Object.keys(categories).length === 0) {
      return;
    }
    setCategoryFilters(categories);
    const numericFiltersTmp: NumericFiltersType = {};
    for (const col in cols) {
      if (['Int64', 'Float64'].includes(cols[col])) {
        const numericFilter: NumericFilterRangeType = {
          min: null,
          max: null
        };
        numericFiltersTmp[col] = numericFilter;
      }
    }
    setNumericFilters(numericFiltersTmp);
    applyFiltersToMap(categories, numericFiltersTmp, initialH3Resolution, initialOpacity, initialHeightMultiplier);
  }, [categories]);

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);

    if (!isDbReady || !db) {
      setError('Database not yet initialized. Please wait.');
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file.');
      return;
    }

    await processFile(file);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isDbReady || !db) {
      setError('Database not yet initialized. Please wait.');
      return;
    }

    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file.');
      return;
    }

    await processFile(file);
  };

  const processFile = async (file: File) => {
    try {
      setIsLoading(true);
      setError(null);

      const fileName = file.name.replace('.csv', '').replace(/[^a-zA-Z0-9]/g, '_');
      const generatedTableName = `csv_${fileName}_${Date.now()}`;
      setTableName(generatedTableName);

      const fileBuffer = await file.arrayBuffer();

      if (db) {
        await db.registerFileBuffer(file.name, new Uint8Array(fileBuffer));
        const conn = await db.connect();
        await conn.query(`
          CREATE TABLE ${generatedTableName} AS 
          SELECT * FROM read_csv_auto('${file.name}')
        `);
        const columnsResult = await conn.query(`PRAGMA table_info(${generatedTableName})`);
        const columns: string[] = [];

        const numColumnsRows = columnsResult.numRows;
        for (let i = 0; i < numColumnsRows; i++) {
          const columnName = columnsResult.getChildAt(1)?.get(i);
          if (typeof columnName === 'string') {
            columns.push(columnName.toLowerCase());
          }
        }

        let latColumn = '';
        let lonColumn = '';

        for (const col of columns) {
          if (col === 'lat') {
            latColumn = col;
          }
          if (col === 'lon') {
            lonColumn = col;
          }
        }

        if (!latColumn || !lonColumn) {
          setError('Could not find lat and lon columns in the CSV file. Please make sure your CSV contains "lat" and "lon" columns.');
          setIsLoading(false);
          await conn.close();
          return;
        }

        const result = await conn.query(`SELECT * FROM ${generatedTableName}`);

        setCols(Object.fromEntries(
          result.schema.fields
            .filter(field => !['lat', 'lon'].includes(field.name))
            .map(field => [field.name, String(field.type)])
        ));

        await conn.close();
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Error processing CSV file:', err);
      setError(`Error processing CSV file: ${err instanceof Error ? err.message : String(err)}`);
      setIsLoading(false);
    }
  };

  const handleDropZoneClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="container">
      <h1 className="title">CSV Map Visualizer</h1>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {!tableName && !isLoading && (
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onClick={handleDropZoneClick}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            type="file"
            ref={fileInputRef}
            className="hidden-input"
            accept=".csv"
            onChange={handleFileSelect}
          />
          <p className="drop-text">Drag & drop a CSV file here, or click to select</p>
          <p className="note-text">Please ensure your CSV file has latitude and longitude columns (named lat and lon)</p>
        </div>
      )}

      {isLoading && (
        <div className="loading-container">
          <div className="loading-spinner"></div>
        </div>
      )}

      <FilterOverlay
        categoryFilters={categoryFilters}
        numericFilters={numericFilters}
        onFilterChange={handleFilterChange}
        isOpen={showFilters}
        onToggle={toggleFilters}
        initialH3Resolution={initialH3Resolution}
        initialOpacity={initialOpacity}
        initialHeightMultiplier={initialHeightMultiplier}
      />

      <div className={`hover-metadata-overlay ${hoverData ? 'visible' : 'hidden'}`}>
        {hoverData && (
          <>
            <div className="metadata-header">Hover Details</div>
            <div className="metadata-content">
              <div className="metadata-item">
                <span className="metadata-label">Count:</span>
                <span className="metadata-value">{hoverData.count}</span>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Total Count:</span>
                <span className="metadata-value">{hoverData.totalCount}</span>
              </div>
              <div className="metadata-item">
                <span className="metadata-label">Ratio:</span>
                <span className="metadata-value">{(hoverData.count / hoverData.totalCount * 100).toFixed(2)}%</span>
              </div>
            </div>
          </>
        )}
      </div>

      <div>
        <div
          ref={mapContainerRef}
          className="map-container"
        />
      </div>

    </div>
  );
};

export default App;
