Return workflow changes
----------------------

What changed
- New unified return endpoint: `POST /returnIssue` (handles `Workshop` and `Testing` returns with damaged quantities).
- A new `damaged_components` table records damaged quantities per return.
- `products` table must have a `damaged` integer column (default 0). A migration file is provided.

Run migration
1. Connect to your `ProductManager` database and run the SQL file:

   psql -U postgres -d ProductManager -f backend/migrations/20260602_add_damaged_components.sql

Backend behavior
- `POST /returnIssue` expects JSON: `{ issueId: <number>, damaged: [{ productId, damagedQty }, ...] }`
- The server validates that damagedQty is between 0 and issued quantity for each issued component.
- For each issued component: returnedQty = issuedQty - damagedQty
- Updates: `products.stock += returnedQty`, `products.damaged += damagedQty`
- Inserts a row into `damaged_components` for each product with damagedQty > 0
- Marks `issues.status = 'Returned'`

Frontend
- The UI shows all issued components for Workshop/Testing issues and asks for per-product damaged quantities.
- Validation prevents damagedQty > issuedQty on the client side as well.
