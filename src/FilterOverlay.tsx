import React, { useState, useEffect } from 'react';

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

type SelectedFiltersType = {
    [category: string]: {
        [value: string]: boolean;
    };
};

type SelectedNumericFiltersType = {
    [field: string]: {
        min: string;
        max: string;
    };
};

interface FilterOverlayProps {
    categoryFilters: CategoryFiltersType;
    numericFilters: NumericFiltersType;
    onFilterChange: (
        categoryFilters: CategoryFiltersType,
        numericFilters: NumericFiltersType,
        h3Resolution: number,
        opacity: number,
        heightMultiplier: number
    ) => void;
    isOpen: boolean;
    onToggle: () => void;
    initialH3Resolution: number;
    initialOpacity: number;
    initialHeightMultiplier: number;
}

const FilterOverlay: React.FC<FilterOverlayProps> = ({
    categoryFilters,
    numericFilters,
    onFilterChange,
    isOpen,
    onToggle,
    initialH3Resolution,
    initialOpacity,
    initialHeightMultiplier,
}) => {
    const [selectedCategoryFilters, setSelectedCategoryFilters] = useState<SelectedFiltersType>({});
    const [selectedNumericFilters, setSelectedNumericFilters] = useState<SelectedNumericFiltersType>({});
    const [h3Resolution, setH3Resolution] = useState<string>(String(initialH3Resolution));
    const [opacity, setOpacity] = useState<number>(initialOpacity);
    const [heightMultiplier, setHeightMultiplier] = useState<string>(String(initialHeightMultiplier));
    const [h3Error, setH3Error] = useState<string>('');
    const [heightMultiplierError, setHeightMultiplierError] = useState<string>('');

    // Initialize selected category filters
    useEffect(() => {
        const initialFilters: SelectedFiltersType = {};

        Object.keys(categoryFilters).forEach(category => {
            initialFilters[category] = {};
            categoryFilters[category].forEach(value => {
                initialFilters[category][value] = true; // Default all to selected
            });
        });

        setSelectedCategoryFilters(initialFilters);
    }, [categoryFilters]);

    // Initialize selected numeric filters
    useEffect(() => {
        const initialNumericFilters: SelectedNumericFiltersType = {};

        Object.keys(numericFilters).forEach(field => {
            initialNumericFilters[field] = {
                min: numericFilters[field].min !== null ? String(numericFilters[field].min) : '',
                max: numericFilters[field].max !== null ? String(numericFilters[field].max) : ''
            };
        });

        setSelectedNumericFilters(initialNumericFilters);
    }, [numericFilters]);

    // Initialize h3Resolution from props
    useEffect(() => {
        if (initialH3Resolution !== null) {
            setH3Resolution(String(initialH3Resolution));
        }
    }, [initialH3Resolution]);

    // Initialize opacity from props
    useEffect(() => {
        setOpacity(initialOpacity);
    }, [initialOpacity]);

    // Initialize heightMultiplier from props
    useEffect(() => {
        if (initialHeightMultiplier !== null) {
            setHeightMultiplier(String(initialHeightMultiplier));
        }
    }, [initialHeightMultiplier]);

    // Handle checkbox changes
    const handleCheckboxChange = (category: string, value: string): void => {
        setSelectedCategoryFilters(prev => ({
            ...prev,
            [category]: {
                ...prev[category],
                [value]: !prev[category][value]
            }
        }));
    };

    // Handle numeric input changes
    const handleNumericInputChange = (
        field: string,
        type: 'min' | 'max',
        value: string
    ): void => {
        // Only allow numeric values and empty string
        if (value === '' || /^-?\d*\.?\d*$/.test(value)) {
            setSelectedNumericFilters(prev => ({
                ...prev,
                [field]: {
                    ...prev[field],
                    [type]: value
                }
            }));
        }
    };

    // Handle H3 resolution input change
    const handleH3ResolutionChange = (value: string): void => {
        // Only allow integer values between 1 and 15
        if (value === '' || /^\d+$/.test(value)) {
            setH3Resolution(value);

            // Validate if entered
            if (value !== '') {
                const numValue = parseInt(value, 10);
                if (numValue < 1 || numValue > 15) {
                    setH3Error('Resolution must be between 1 and 15');
                } else {
                    setH3Error('');
                }
            } else {
                setH3Error('');
            }
        }
    };

    // Handle height multiplier input change
    const handleHeightMultiplierChange = (value: string): void => {
        // Only allow non-negative float values
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setHeightMultiplier(value);

            // Validate if entered
            if (value !== '') {
                const numValue = parseFloat(value);
                if (numValue < 0) {
                    setHeightMultiplierError('Height multiplier must be greater than or equal to 0');
                } else {
                    setHeightMultiplierError('');
                }
            } else {
                setHeightMultiplierError('');
            }
        }
    };

    // Handle opacity slider change
    const handleOpacityChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
        const value = parseFloat(event.target.value);
        setOpacity(value);
    };

    // Apply filters
    const applyFilters = (): void => {
        // Validate H3 resolution and heightMultiplier
        if ((h3Resolution !== '' && h3Error) || (heightMultiplier !== '' && heightMultiplierError)) {
            return; // Don't apply if there's an error
        }

        // Process category filters
        const activeCategoryFilters: CategoryFiltersType = {};

        Object.keys(selectedCategoryFilters).forEach(category => {
            activeCategoryFilters[category] = [];

            Object.keys(selectedCategoryFilters[category]).forEach(value => {
                if (selectedCategoryFilters[category][value]) {
                    activeCategoryFilters[category].push(value);
                }
            });
        });

        // Process numeric filters
        const activeNumericFilters: NumericFiltersType = {};

        Object.keys(selectedNumericFilters).forEach(field => {
            const minValue = selectedNumericFilters[field].min === ''
                ? null
                : parseFloat(selectedNumericFilters[field].min);

            const maxValue = selectedNumericFilters[field].max === ''
                ? null
                : parseFloat(selectedNumericFilters[field].max);

            activeNumericFilters[field] = {
                min: minValue,
                max: maxValue
            };
        });

        onFilterChange(
            activeCategoryFilters, 
            activeNumericFilters, 
            parseInt(h3Resolution, 10), 
            opacity,
            parseFloat(heightMultiplier) || 0,
        );
    };

    // Reset all filters
    const resetFilters = (): void => {
        // Reset category filters
        const resetCategoryState: SelectedFiltersType = {};

        Object.keys(categoryFilters).forEach(category => {
            resetCategoryState[category] = {};
            categoryFilters[category].forEach(value => {
                resetCategoryState[category][value] = true;
            });
        });

        setSelectedCategoryFilters(resetCategoryState);

        // Reset numeric filters
        const resetNumericState: SelectedNumericFiltersType = {};

        Object.keys(numericFilters).forEach(field => {
            resetNumericState[field] = {
                min: numericFilters[field].min !== null ? String(numericFilters[field].min) : '',
                max: numericFilters[field].max !== null ? String(numericFilters[field].max) : ''
            };
        });

        setSelectedNumericFilters(resetNumericState);

        // Reset H3 resolution
        setH3Resolution(String(initialH3Resolution));
        setH3Error('');

        // Reset opacity
        setOpacity(initialOpacity);

        // Reset height multiplier
        setHeightMultiplier(String(initialHeightMultiplier));
        setHeightMultiplierError('');

        // Apply the reset
        onFilterChange(
            categoryFilters, 
            numericFilters, 
            initialH3Resolution, 
            initialOpacity,
            initialHeightMultiplier
        );
    };

    if (!isOpen) {
        return (
            <button className="toggle-filter-btn" onClick={onToggle}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M1.5 1.5A.5.5 0 0 1 2 1h12a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-.128.334L10 8.692V13.5a.5.5 0 0 1-.342.474l-3 1A.5.5 0 0 1 6 14.5V8.692L1.628 3.834A.5.5 0 0 1 1.5 3.5v-2z" />
                </svg>
                Filters
            </button>
        );
    }

    return (
        <div className="filter-overlay">
            <div className="filter-header">
                <div className="filter-title">Filter Map Data</div>
                <button className="close-filter-btn" onClick={onToggle}>×</button>
            </div>

            {/* Category Filters */}
            {Object.keys(categoryFilters).length > 0 && (
                <div className="filter-group">
                    <h3 className="filter-group-title">Categories</h3>

                    {Object.keys(categoryFilters).map(category => (
                        <div key={category} className="filter-section">
                            <div className="filter-category">{category}</div>
                            <div className="filter-options">
                                {categoryFilters[category].map(value => (
                                    <div key={value} className="filter-option">
                                        <input
                                            type="checkbox"
                                            id={`${category}-${value}`}
                                            className="filter-checkbox"
                                            checked={selectedCategoryFilters[category]?.[value] || false}
                                            onChange={() => handleCheckboxChange(category, value)}
                                        />
                                        <label
                                            htmlFor={`${category}-${value}`}
                                            className="filter-label"
                                        >
                                            {value}
                                        </label>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Numeric Filters */}
            {Object.keys(numericFilters).length > 0 && (
                <div className="filter-group">
                    <h3 className="filter-group-title">Numeric Ranges</h3>

                    {Object.keys(numericFilters).map(field => (
                        <div key={field} className="filter-section">
                            <div className="filter-category">{field}</div>
                            <div className="numeric-filter-inputs">
                                <div className="numeric-input-group">
                                    <label className="numeric-label">Min:</label>
                                    <input
                                        type="text"
                                        className="numeric-input"
                                        value={selectedNumericFilters[field]?.min || ''}
                                        onChange={(e) => handleNumericInputChange(field, 'min', e.target.value)}
                                        placeholder="Minimum"
                                    />
                                </div>
                                <div className="numeric-input-group">
                                    <label className="numeric-label">Max:</label>
                                    <input
                                        type="text"
                                        className="numeric-input"
                                        value={selectedNumericFilters[field]?.max || ''}
                                        onChange={(e) => handleNumericInputChange(field, 'max', e.target.value)}
                                        placeholder="Maximum"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

{/* H3 Resolution Input */}
<div className="filter-group">
                <h3 className="filter-group-title">H3 Resolution</h3>
                <div className="filter-section">
                    <div className="numeric-filter-inputs">
                        <div className="numeric-input-group">
                            <input
                                type="text"
                                className={`numeric-input ${h3Error ? 'input-error' : ''}`}
                                value={h3Resolution}
                                onChange={(e) => handleH3ResolutionChange(e.target.value)}
                                placeholder="Enter value (1-15)"
                            />
                        </div>
                    </div>
                    {h3Error && <div className="error-message">{h3Error}</div>}
                </div>
            </div>

            {/* Height Multiplier Input */}
            <div className="filter-group">
                <h3 className="filter-group-title">Height Multiplier</h3>
                <div className="filter-section">
                    <div className="numeric-filter-inputs">
                        <div className="numeric-input-group">
                            <input
                                type="text"
                                className={`numeric-input ${heightMultiplierError ? 'input-error' : ''}`}
                                value={heightMultiplier}
                                onChange={(e) => handleHeightMultiplierChange(e.target.value)}
                                placeholder="Enter value (≥ 0)"
                            />
                        </div>
                    </div>
                    {heightMultiplierError && <div className="error-message">{heightMultiplierError}</div>}
                </div>
            </div>

            {/* Opacity Slider */}
            <div className="filter-group">
                <h3 className="filter-group-title">Opacity</h3>
                <div className="filter-section">
                    <div className="opacity-slider-container">
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={opacity ? opacity : 1.0}
                            onChange={handleOpacityChange}
                            className="opacity-slider"
                        />
                        <div className="opacity-value">{opacity.toFixed(2)}</div>
                    </div>
                </div>
            </div>
            
            <div className="filter-actions">
                <button className="reset-filters-btn" onClick={resetFilters}>
                    Reset
                </button>
                <button
                    className="apply-filters-btn"
                    onClick={applyFilters}
                    disabled={!!h3Error || !!heightMultiplierError}
                >
                    Apply Filters
                </button>
            </div>
        </div>
    );
};

export default FilterOverlay;