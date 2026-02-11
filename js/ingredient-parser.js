// ============================================
// INGREDIENT PARSER UTILITY
// Parses recipe ingredients and maps to inventory costs
// ============================================

/**
 * Parse ingredient string to extract quantity and unit
 * Examples:
 * "Take Oil & Whole Spices 40 gm" -> { quantity: 40, unit: "gm", name: "Oil & Whole Spices" }
 * "Boiled Boiling Ingredients For Mutton 770 gm" -> { quantity: 770, unit: "gm", name: "Mutton" }
 * "Sliced Garnish 10 gm" -> { quantity: 10, unit: "gm", name: "Garnish" }
 */
function parseIngredient(ingredientString) {
    // Common units to look for
    const units = ['gm', 'g', 'kg', 'ml', 'l', 'liters', 'liter', 'pieces', 'pcs', 'nos', 'cups', 'tbsp', 'tsp'];
    
    // Extract quantity and unit using regex
    const quantityPattern = /(\d+(?:\.\d+)?)\s*(gm|g|kg|ml|l|liters|liter|pieces|pcs|nos|cups|tbsp|tsp)/i;
    const match = ingredientString.match(quantityPattern);
    
    if (match) {
        const quantity = parseFloat(match[1]);
        const unit = match[2].toLowerCase();
        
        // Extract product name (remove quantity/unit and common prefixes)
        let name = ingredientString
            .replace(quantityPattern, '')
            .replace(/^(take|add|boiled|sliced|marinated|chopped|diced|minced|auto|garnish)\s+/gi, '')
            .trim();
        
        // Clean up extra spaces
        name = name.replace(/\s+/g, ' ').trim();
        
        return {
            original: ingredientString,
            name: name || ingredientString,
            quantity: quantity,
            unit: unit,
            cost: 0 // Will be calculated from inventory
        };
    }
    
    // If no quantity found, return as is
    return {
        original: ingredientString,
        name: ingredientString,
        quantity: 0,
        unit: '',
        cost: 0
    };
}

/**
 * Parse all ingredients from a recipe
 */
function parseRecipeIngredients(ingredientsArray) {
    if (!Array.isArray(ingredientsArray)) return [];
    
    return ingredientsArray.map(ing => parseIngredient(ing));
}

/**
 * Match parsed ingredient to inventory and calculate cost
 */
async function matchIngredientToInventory(parsedIngredient, supabase) {
    if (!parsedIngredient.quantity || !parsedIngredient.name) {
        return parsedIngredient;
    }
    
    // Search inventory for matching product
    // Try exact match first, then fuzzy match
    const { data: inventoryItems } = await supabase
        .from('inventory')
        .select('*')
        .ilike('product_name', `%${parsedIngredient.name}%`)
        .limit(1);
    
    if (inventoryItems && inventoryItems.length > 0) {
        const item = inventoryItems[0];
        
        // Convert quantity to match inventory unit
        let convertedQuantity = parsedIngredient.quantity;
        
        // Convert to inventory unit
        if (parsedIngredient.unit === 'gm' || parsedIngredient.unit === 'g') {
            if (item.unit === 'kg') {
                convertedQuantity = parsedIngredient.quantity / 1000;
            }
        } else if (parsedIngredient.unit === 'kg') {
            if (item.unit === 'gm' || item.unit === 'g') {
                convertedQuantity = parsedIngredient.quantity * 1000;
            }
        } else if (parsedIngredient.unit === 'ml') {
            if (item.unit === 'l' || item.unit === 'liters') {
                convertedQuantity = parsedIngredient.quantity / 1000;
            }
        } else if (parsedIngredient.unit === 'l' || parsedIngredient.unit === 'liters') {
            if (item.unit === 'ml') {
                convertedQuantity = parsedIngredient.quantity * 1000;
            }
        }
        
        // Calculate cost
        const cost = convertedQuantity * item.unit_cost;
        
        return {
            ...parsedIngredient,
            inventory_id: item.id,
            inventory_product: item.product_name,
            inventory_brand: item.brand_name,
            inventory_unit_cost: item.unit_cost,
            converted_quantity: convertedQuantity,
            cost: Math.round(cost * 100) / 100 // Round to 2 decimals
        };
    }
    
    // No match found
    return {
        ...parsedIngredient,
        cost: 0,
        matched: false
    };
}

/**
 * Calculate total recipe cost from parsed ingredients
 */
function calculateRecipeTotalCost(parsedIngredients) {
    return parsedIngredients.reduce((total, ing) => {
        return total + (ing.cost || 0);
    }, 0);
}

/**
 * Process entire recipe JSON and match with inventory
 */
async function processRecipeWithInventory(recipe, supabase) {
    // Parse ingredients
    const parsedIngredients = parseRecipeIngredients(recipe.Ingredients || []);
    
    // Match each ingredient with inventory
    const matchedIngredients = await Promise.all(
        parsedIngredients.map(ing => matchIngredientToInventory(ing, supabase))
    );
    
    // Calculate total cost
    const totalCost = calculateRecipeTotalCost(matchedIngredients);
    
    return {
        name: recipe['Recipe Name'],
        veg_non_veg: recipe['Veg/Non Veg'],
        cooking_mode: recipe['Cooking Mode'],
        cuisine: recipe.Cuisine,
        category: recipe.Category,
        cooking_time: recipe['Cooking Time'],
        image_url: recipe.Image,
        popup_image_url: recipe.PopupImage,
        ingredients: recipe.Ingredients, // Original
        parsed_ingredients: matchedIngredients,
        accessories: recipe.Accessories,
        total_output: recipe['Total Output'],
        on2cook_time: recipe['On2Cook Cooking Time'],
        normal_cooking_time: recipe['Normal Cooking Time'],
        total_cost: totalCost
    };
}

/**
 * Bulk import recipes from JSON file
 */
async function bulkImportRecipes(recipesJson, supabase, onProgress) {
    const results = {
        total: recipesJson.length,
        success: 0,
        failed: 0,
        errors: []
    };
    
    for (let i = 0; i < recipesJson.length; i++) {
        try {
            const recipe = recipesJson[i];
            
            // Process recipe with inventory matching
            const processedRecipe = await processRecipeWithInventory(recipe, supabase);
            
            // Insert into database
            const { error } = await supabase
                .from('recipes')
                .insert([processedRecipe]);
            
            if (error) {
                results.failed++;
                results.errors.push({
                    recipe: recipe['Recipe Name'],
                    error: error.message
                });
            } else {
                results.success++;
            }
            
            // Progress callback
            if (onProgress) {
                onProgress({
                    current: i + 1,
                    total: recipesJson.length,
                    percentage: Math.round(((i + 1) / recipesJson.length) * 100)
                });
            }
            
        } catch (err) {
            results.failed++;
            results.errors.push({
                recipe: recipesJson[i]['Recipe Name'],
                error: err.message
            });
        }
    }
    
    return results;
}

// Export functions
window.IngredientParser = {
    parseIngredient,
    parseRecipeIngredients,
    matchIngredientToInventory,
    calculateRecipeTotalCost,
    processRecipeWithInventory,
    bulkImportRecipes
};