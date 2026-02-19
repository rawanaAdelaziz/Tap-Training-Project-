const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const multer = require("multer");
const FormData = require("form-data");
const fetch = require("node-fetch");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/"); 
  },
  filename: function (req, file, cb) {
    cb(
      null,
      Date.now() + "-" + file.originalname
    );
  },
});

// multer instance
const upload = multer({ storage });

const app = express();
app.use(cors());
app.use(express.json());


const MARKETPLACE_SECRET_KEY = process.env.MARKETPLACE_SECRET_KEY;
console.log("MARKETPLACE_SECRET_KEY =", process.env.MARKETPLACE_SECRET_KEY);

const MARKETPLACE_SECRET_TEST_KEY = process.env.MARKETPLACE_SECRET_TEST_KEY;
console.log("MARKETPLACE_SECRET_TEST_KEY =", process.env.MARKETPLACE_SECRET_TEST_KEY);

let retailerSplits = {}; 


let marketplaceConfig = {
  percentage: 0
};



//1.FILE API
app.post("/upload-kyc", upload.single("file"), async (req, res) => {
  try {
    const { purpose, title } = req.body;
    const filePath = req.file.path;

    const fd = new FormData();
    fd.append("file", fs.createReadStream(filePath));
    fd.append("purpose", purpose);
    fd.append("title", title || "KYC Document");
    fd.append("file_link_create", "true");

    const tapRes = await fetch("https://api.tap.company/v2/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MARKETPLACE_SECRET_KEY}`,
        ...fd.getHeaders()
      },
      body: fd
    });

    const data = await tapRes.json();

    if (!tapRes.ok) {
      return res.status(400).json(data);
    }

    res.json({
      file_id: data.id,
      raw: data
    });

  } catch (e) {
    console.error("Upload KYC error:", e);
    res.status(500).json({ error: e.message });
  }
});

//2.Create retailer lead 
app.post("/create-retailer-lead", async (req, res) => {
  try {
    const {
      brandName,
      country,
      user,
      iban,
      files
    } = req.body;

    if (!user?.identification_id) {
      return res.status(400).json({
        error: "user.identification_id is required"
      });
    }

    const payload = {
        segment: {
            type: "BUSINESS",
            sub_segment: {
                type: "RETAILER"
            }
},
 country: country,
      brand: {
        name: [{
          text: brandName,
          lang: "en"
        }],
        logo: files.marchantLOGO,
    
        channel_services: [
      {
        channel: "website",
        address: "https://rawan.tap-test.com/ConfigurationRetailerPage.html"
      }],
        // operations: {
        //   sales: {
        //     period: "monthly",
        //     range: {
        //       from: "10000",
        //       to: "80000"
        //     },
        //     currency: "KWD"
        //   }
        // },
        // terms: [
        //   { term: "general", agree: true },
        //   { term: "chargeback", agree: true },
        //   { term: "refund", agree: true }
        // ]
      },

      entity: {
        id:"ent_XaTwK4261435R4Dr8gF0n135",
        legal_name: [
          {
            text: brandName,
            lang: "en"
          }
        ],

        documents: [
          {
            name: "commercial_registration",
            images: files.trade_license
          }
        ],
        license: {
          unified_number: user.identification_id,
          country: country,
          name: "LLC",
          documents: [
            {
              name: "commercial_registration",
              number: user.identification_id,
              issuing_country: country
            }
          ]
        }
      },

      users:[
        {
        name: [{
          first: user.firstName,
          last: user.lastName,
          lang: "en"
        } ],
        contact: {
        email: [
          {
            address: user.email,
            primary: true
          }
        ],
        phone: [
          {
            country_code: user.countryCode,
            number: user.phone,
            primary: true
          }
        ] },
        identification: {
          number: user.identification_id,
          type: "national_id",
          country: country,
           images: [
            files.owner_id_front,
            files.owner_id_back
          ]
        },
        birth: {
            date: "1981-05-05"
          },
          
        primary: true
      }
    ],
      wallet: {
        name: [
          {
            text: "Wallet Display name text",
            lang: "en"
          }
        ],
        linked_financial_account: {
          bank: {
            account: {
              name: "Beneficiary Name",
               iban: "KW123000000456789"
            }
          }
        }
      },
      marketplace: {
        id: "68011547" 
      },

      post: {
        url: "https://rawan.tap-test.com/onboarding.html"
      }
    };


console.log("FINAL PAYLOAD:", JSON.stringify(payload, null, 2));
    const tapRes = await fetch("https://api.tap.company/v3/lead/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MARKETPLACE_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await tapRes.json();

    return res.json(data);

  } catch (e) {
    console.error("Create lead error:", e);
    return res.status(500).json({
      error: "Create lead failed"
    });
  }
});


//3.Create an Account (Retailer)
app.post("/Retailer-Account", async (req, res) => {
  try {
    const { lead_id } = req.body;

    if (!lead_id ) { 
      return res.status(400).json({ error: "lead_id is required" });
    }

    const tapRes = await fetch(
      "https://api.tap.company/v3/connect/account",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MARKETPLACE_SECRET_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lead_id,
        })
      }
    );

    const data = await tapRes.json();

    if (!tapRes.ok) {
      return res.status(400).json(data);
    }

    return res.json({
      message: "Lead converted successfully",
      tap_response: data
    });

  } catch (err) {
    console.error("Convert Lead Error:", err);
    res.status(500).json({ error: "Convert lead failed" });
  }
});



//Retrieve retailers list under the Marketplace
app.post("/retailers/list", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.body;

    const tapRes = await fetch(
      "https://api.tap.company/v2/destination/list",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MARKETPLACE_SECRET_KEY}`, 
          "Content-Type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          page,
          limit
        })
      }
    );

    const data = await tapRes.json();

    if (!tapRes.ok) {
      return res.status(400).json({
        error: "Tap error",
        tap_response: data
      });
    }

      if (!data.destinations || !Array.isArray(data.destinations)) {
      return res.json([]);
    }
    console.log("FULL TAP RESPONSE:");
    console.log(JSON.stringify(data, null, 2));

     if (!data.destinations) {
  console.log("destinations undefined!");
  return res.json([]);
}

if (!Array.isArray(data.destinations)) {
  console.log("destinations is not array!");
  return res.json([]);
}

const retailers = data.destinations
  .filter(dest => dest.status === "Active")
  .map(dest => ({
    destination_id: dest.id,
    name: dest.display_name,
    status: dest.status
  }));

return res.json(retailers);




  } catch (err) {
    console.error("retailers list error:", err);
    res.status(500).json({
      error: "Failed to fetch retailers list"
    });
  }
});



// Set retailer split %
app.post("/retailer/config", (req, res) => {
  const { destination_id, percentage } = req.body;

  if (!destination_id || percentage == null) {
    return res.status(400).json({ error: "Missing fields" });
  }

  retailerSplits[destination_id] = {
    percentage: Number(percentage)
  };

  res.json({
    message: "Split saved successfully",
    data: retailerSplits[destination_id]
  });
});


//products
let products = [
  {
    id: 1,
    retailer_id: "68022050",
    name: "iPhone 17",
    price: 500
  },
  {
    id: 2,
    retailer_id: "68021971",
    name: "AirPods Pro",
    price: 120
  },
  {
    id: 3,
    retailer_id: "68021968",
    name: "Samsung S25",
    price: 450
  },
  {
    id: 4,
    retailer_id: "68021968",
    name: "Galaxy Buds",
    price: 95
  }
];

app.get("/products", (req, res) => {
  return res.json(products);
});


// Add new product (in prograss)
app.post("/products", (req, res) => {
  const { retailer_id, name, price } = req.body;

  if (!retailer_id || !name || !price) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const newProduct = {
    id: products.length + 1,
    retailer_id,
    name,
    price: Number(price)
  };

  products.push(newProduct);

  res.json(newProduct);
});


app.post("/marketplace/charge", async (req, res) => {
  try {
    const { items, currency } = req.body;

    let totalAmount = 0;
    let grouped = {};

    items.forEach(item => {

      const product = products.find(p => p.id === item.product_id);

      if (!product) {
        throw new Error("Product not found");
      }

      totalAmount += product.price;

      if (!grouped[product.retailer_id]) {
        grouped[product.retailer_id] = 0;
      }

      grouped[product.retailer_id] += product.price;
    });

    let destinations = [];

    Object.keys(grouped).forEach(destId => {

      const retailerTotal = grouped[destId];

  
const percent =
  vendorPercentages[destId] !== undefined
    ? vendorPercentages[destId]
    : marketplaceConfig.percentage; 

const commissionAmount =
  retailerTotal * percent / 100;

const vendorAmount =
  retailerTotal - commissionAmount;


      destinations.push({
        id: destId,
        amount: vendorAmount,
        currency

      });
    });

    const payload = {
      amount: totalAmount,
      currency,
      customer: {
    first_name: "RawanMARKETPLACE",
    email: "RawanMARKETPLACE@test.com",
    phone: {
      country_code: "965",
      number: "97202192"
    }
},
      source: { id: "src_all" },
      destinations,
    redirect: {
    url: "https://rawan.tap-test.com/marketplace-result.html"
  },
   post: {
        url: "https://rawan.tap-test.com/marketplace-result.html"
      }
    };

    const tapRes = await fetch(
      "https://api.tap.company/v2/charges",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${MARKETPLACE_SECRET_TEST_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    const data = await tapRes.json();

    res.json({
      total: totalAmount,
      commission: marketplaceConfig.percentage,
      destinations,
      tap_response: data
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/marketplace/config", (req, res) => {

  const { percentage } = req.body;

  marketplaceConfig.percentage = percentage;

  return res.json({
    message: "Updated",
    percentage
  });
});


app.get("/marketplace/status", async (req, res) => {
  try {

    const { tap_id } = req.query;

    if (!tap_id) {
      return res.status(400).json({ error: "tap_id is required" });
    }

    const tapRes = await fetch(
      `https://api.tap.company/v2/charges/${tap_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${MARKETPLACE_SECRET_TEST_KEY }`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await tapRes.json();

    if (!tapRes.ok) {
      return res.status(400).json(data);
    }

     res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get payment status" });
  }
});


let vendorPercentages = {};

app.post("/marketplace/percentage/vendor", (req, res) => {

  const { retailerId, percentage } = req.body;

  // Validation
  if (!retailerId) {
    return res.status(400).json({
      error: "retailerId is required"
    });
  }

  if (percentage === undefined || percentage === null) {
    return res.status(400).json({
      error: "percentage is required"
    });
  }

  if (percentage < 0 || percentage > 100) {
    return res.status(400).json({
      error: "percentage must be between 0 and 100"
    });
  }

  // Save percentage
  vendorPercentages[retailerId] = Number(percentage);

  console.log("Updated Vendor Commission:", vendorPercentages);

  res.json({
    success: true,
    retailerId,
    percentage: vendorPercentages[retailerId]
  });

});


app.get("/marketplace/percentage/vendor", (req, res) => {

  res.json(vendorPercentages);

});



app.listen(3000, () => {
  console.log("✅ Server running on http://localhost:3000");
});


