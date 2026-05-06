-- CreateEnum
CREATE TYPE "PackageUnit" AS ENUM ('G', 'KG', 'ML', 'L', 'UNIT');

-- CreateEnum
CREATE TYPE "BaseUnit" AS ENUM ('G', 'ML', 'UNIT');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('PURCHASE', 'SALE', 'WASTE', 'ADJUSTMENT', 'RETURN');

-- CreateEnum
CREATE TYPE "SaleType" AS ENUM ('POS', 'MANUAL');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'OTHER');

-- CreateEnum
CREATE TYPE "SaleStatus" AS ENUM ('COMPLETED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "packageQty" DECIMAL(12,3) NOT NULL,
    "packageUnit" "PackageUnit" NOT NULL,
    "baseQty" DECIMAL(12,3) NOT NULL,
    "baseUnit" "BaseUnit" NOT NULL,
    "lowStockAlertQty" DECIMAL(12,3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseCarter" (
    "id" UUID NOT NULL,
    "carterNo" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "supplierName" TEXT,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseCarter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseCarterItem" (
    "id" UUID NOT NULL,
    "carterId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "loadedQty" DECIMAL(12,3) NOT NULL,
    "pricePerPackage" DECIMAL(12,2) NOT NULL,
    "totalBaseQty" DECIMAL(12,3) NOT NULL,
    "totalPrice" DECIMAL(12,2) NOT NULL,
    "unitCostBase" DECIMAL(12,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseCarterItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientStockLot" (
    "id" UUID NOT NULL,
    "carterItemId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "receivedBaseQty" DECIMAL(12,3) NOT NULL,
    "remainingBaseQty" DECIMAL(12,3) NOT NULL,
    "baseUnit" "BaseUnit" NOT NULL,
    "unitCostBase" DECIMAL(12,6) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),

    CONSTRAINT "IngredientStockLot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "stockLotId" UUID,
    "movementType" "StockMovementType" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "qtyDelta" DECIMAL(12,3) NOT NULL,
    "unitCostBase" DECIMAL(12,6),
    "costAmount" DECIMAL(12,2),
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "variantName" TEXT,
    "sellPrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductRecipeItem" (
    "id" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "requiredBaseQty" DECIMAL(12,3) NOT NULL,
    "baseUnit" "BaseUnit" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductRecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesChannel" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesOrder" (
    "id" UUID NOT NULL,
    "orderNo" TEXT NOT NULL,
    "salesChannelId" UUID,
    "saleType" "SaleType" NOT NULL DEFAULT 'POS',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "grossTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cogsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profitTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "SaleStatus" NOT NULL DEFAULT 'COMPLETED',
    "createdById" UUID,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalesOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" UUID NOT NULL,
    "salesOrderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitSellPrice" DECIMAL(12,2) NOT NULL,
    "lineTotal" DECIMAL(12,2) NOT NULL,
    "cogsTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "profitTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleItemFifoConsumption" (
    "id" UUID NOT NULL,
    "saleItemId" UUID NOT NULL,
    "stockLotId" UUID NOT NULL,
    "ingredientId" UUID NOT NULL,
    "consumedBaseQty" DECIMAL(12,3) NOT NULL,
    "unitCostBase" DECIMAL(12,6) NOT NULL,
    "costAmount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleItemFifoConsumption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE INDEX "Ingredient_name_idx" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "Ingredient_brand_idx" ON "Ingredient"("brand");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseCarter_carterNo_key" ON "PurchaseCarter"("carterNo");

-- CreateIndex
CREATE INDEX "PurchaseCarterItem_carterId_idx" ON "PurchaseCarterItem"("carterId");

-- CreateIndex
CREATE INDEX "PurchaseCarterItem_ingredientId_idx" ON "PurchaseCarterItem"("ingredientId");

-- CreateIndex
CREATE INDEX "IngredientStockLot_ingredientId_remainingBaseQty_idx" ON "IngredientStockLot"("ingredientId", "remainingBaseQty");

-- CreateIndex
CREATE INDEX "IngredientStockLot_receivedAt_idx" ON "IngredientStockLot"("receivedAt");

-- CreateIndex
CREATE INDEX "StockMovement_ingredientId_idx" ON "StockMovement"("ingredientId");

-- CreateIndex
CREATE INDEX "StockMovement_movementType_idx" ON "StockMovement"("movementType");

-- CreateIndex
CREATE INDEX "StockMovement_occurredAt_idx" ON "StockMovement"("occurredAt");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "ProductRecipeItem_productId_idx" ON "ProductRecipeItem"("productId");

-- CreateIndex
CREATE INDEX "ProductRecipeItem_ingredientId_idx" ON "ProductRecipeItem"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecipeItem_productId_ingredientId_key" ON "ProductRecipeItem"("productId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesChannel_name_key" ON "SalesChannel"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_orderNo_key" ON "SalesOrder"("orderNo");

-- CreateIndex
CREATE INDEX "SalesOrder_soldAt_idx" ON "SalesOrder"("soldAt");

-- CreateIndex
CREATE INDEX "SalesOrder_status_idx" ON "SalesOrder"("status");

-- CreateIndex
CREATE INDEX "SaleItem_salesOrderId_idx" ON "SaleItem"("salesOrderId");

-- CreateIndex
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

-- CreateIndex
CREATE INDEX "SaleItemFifoConsumption_saleItemId_idx" ON "SaleItemFifoConsumption"("saleItemId");

-- CreateIndex
CREATE INDEX "SaleItemFifoConsumption_stockLotId_idx" ON "SaleItemFifoConsumption"("stockLotId");

-- CreateIndex
CREATE INDEX "SaleItemFifoConsumption_ingredientId_idx" ON "SaleItemFifoConsumption"("ingredientId");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCarter" ADD CONSTRAINT "PurchaseCarter_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCarterItem" ADD CONSTRAINT "PurchaseCarterItem_carterId_fkey" FOREIGN KEY ("carterId") REFERENCES "PurchaseCarter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseCarterItem" ADD CONSTRAINT "PurchaseCarterItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientStockLot" ADD CONSTRAINT "IngredientStockLot_carterItemId_fkey" FOREIGN KEY ("carterItemId") REFERENCES "PurchaseCarterItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientStockLot" ADD CONSTRAINT "IngredientStockLot_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "IngredientStockLot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeItem" ADD CONSTRAINT "ProductRecipeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecipeItem" ADD CONSTRAINT "ProductRecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_salesChannelId_fkey" FOREIGN KEY ("salesChannelId") REFERENCES "SalesChannel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesOrder" ADD CONSTRAINT "SalesOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemFifoConsumption" ADD CONSTRAINT "SaleItemFifoConsumption_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemFifoConsumption" ADD CONSTRAINT "SaleItemFifoConsumption_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "IngredientStockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItemFifoConsumption" ADD CONSTRAINT "SaleItemFifoConsumption_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
