import fetch from "node-fetch";

export default async function handler(req, res) {

  // ✅ Add CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  // ✅ Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  const { gold_rate, labour_rate, gst_rate } = req.body;
  const SHOPIFY_STORE = process.env.VITE_SHOPIFY_STORE_NAME;
  const ACCESS_TOKEN = process.env.VITE_SHOPIFY_APP_ACCESS_TOKEN;

  try {
    console.log("Starting product price update...");

    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const resProd = await fetch(
        `https://${SHOPIFY_STORE}/admin/api/2023-10/products.json?limit=50&page=${page}&status=active`,
        { headers: { "X-Shopify-Access-Token": ACCESS_TOKEN } }
      );

      const data = await resProd.json();
      if (!data.products || data.products.length === 0) {
        hasMore = false;
        break;
      }

      for (const product of data.products) {
        try {
          const metaRes = await fetch(
            `https://${SHOPIFY_STORE}/admin/api/2023-10/products/${product.id}/metafields.json`,
            { headers: { "X-Shopify-Access-Token": ACCESS_TOKEN } }
          );

          const { metafields } = await metaRes.json();

          const gold_weight = parseFloat(metafields.find(m => m.key === "gold_weight")?.value || 0);
          const diamond_price = parseFloat(metafields.find(m => m.key === "diamond_price")?.value || 0);
          const diamond_weight = parseFloat(metafields.find(m => m.key === "diamond_weight")?.value || 0);
          const total_weight = gold_weight + diamond_weight;

          const goldPrice = gold_rate * gold_weight;
          const labourPrice = labour_rate * total_weight;
          const basePrice = goldPrice + labourPrice + diamond_price;
          const finalPrice = basePrice + (basePrice * gst_rate / 100);

          if (product.variants && product.variants.length > 0) {
            const variantId = product.variants[0].id;

            await fetch(
              `https://${SHOPIFY_STORE}/admin/api/2023-10/variants/${variantId}.json`,
              {
                method: "PUT",
                headers: {
                  "X-Shopify-Access-Token": ACCESS_TOKEN,
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({
                  variant: { id: variantId, price: finalPrice.toFixed(2) }
                })
              }
            );

            console.log(`✅ Updated ${product.title} → ₹${finalPrice.toFixed(2)}`);
          }
        } catch (err) {
          console.error(`❌ Error updating product ${product.title}:`, err);
        }
      }

      page++;
    }

    return res.json({ message: "All products updated successfully!" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Error updating prices!" });
  }
}
