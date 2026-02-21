const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
require("dotenv").config();
const multer = require("multer");
const FormData = require("form-data");
const fetch = require("node-fetch");


//uploads file
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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



app.get("/", (req, res) => {
  res.send("Backend is working....");
});

const TAP_SECRET_KEY = process.env.TAP_SECRET_KEY;
console.log("TAP_SECRET_KEY =", process.env.TAP_SECRET_KEY);
const TAP_PLATFORM_SECRET_KEY = process.env.TAP_PLATFORM_SECRET_KEY
console.log("TAP_PLATFORM_SECRET_KEY =", process.env.TAP_PLATFORM_SECRET_KEY);
const SUPER_KEY = process.env.SUPER_KEY
console.log("TAP_SUPER_KEY =", process.env.SUPER_KEY);

const MARKETPLACE_SECRET_KEY = process.env.MARKETPLACE_SECRET_KEY;
console.log("MARKETPLACE_SECRET_KEY =", process.env.MARKETPLACE_SECRET_KEY);

const MARKETPLACE_SECRET_TEST_KEY = process.env.MARKETPLACE_SECRET_TEST_KEY;
console.log("MARKETPLACE_SECRET_TEST_KEY =", process.env.MARKETPLACE_SECRET_TEST_KEY);

const TAP_TEST_SECRET_KEY = process.env.TAP_TEST_SECRET_KEY;
console.log("TAP_TEST_SECRET_KEY =", process.env.TAP_TEST_SECRET_KEY);

const customersFile = path.join(__dirname, "customers.json");
const transactionsFile = path.join(__dirname, "transactions.json");
const kfastFile = path.join(__dirname, "kfast.json");

function readJSON(file) {
  if (!fs.existsSync(file)) return [];
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}


//receives the payment request from the UI
//APPLEPay 
app.post("/pay/applepay", async (req, res) => {
  try {
    console.log("/pay/applepay HIT");
    console.log("BODY:", req.body);

    const { 
        tokenId, 
        name,
        email,
        phone,
        amount, 
        currency,
        countryCode,
        } = req.body;

    if (!tokenId) {
      return res.status(400).json({ error: "Missing tokenId" });
    }
//data cames from the UI
    const payload = {
      amount,
      currency,
      customer: {
        first_name: name || "Guest",
        email: email || "test@test.com",
        phone: phone,
        countryCode: countryCode
      },
      source: { id: tokenId },
      post: {
        url: "https://rawan.tap-test.com"
  },
    redirect: {
        url: "https://rawan.tap-test.com"
  },
      //add the reference transaction and  order
      reference: {
        transaction: `txn_${Date.now()}`,
        order: `order_${Date.now()}`
  },
      description: "Apple Pay Web Charge"
    };

    //used the token ID to create Tap charge API
    const tapRes = await fetch("https://api.tap.company/v2/charges/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TAP_SECRET_KEY}`
      },
      body: JSON.stringify(payload)
    });

//returns a detailed charge object.
    const charge = await tapRes.json();
    console.log("Tap response:", charge);


    const customers = readJSON(customersFile);

    customers.push({
      customer_id: `cust_${Date.now()}`,
      name,
      email,
      phone,
      countryCode,
      created_at: new Date().toISOString(),
      cards: []
    });
writeJSON(customersFile, customers);


 //Save Transaction

    const transactions = readJSON(transactionsFile);

    transactions.push({
      transaction_id: charge.id,
      customer_email: email,
      amount : charge.amount,//
      currency: charge.currency,//
      status: charge.status,
      payment_method: "APPLE_PAY",
      created_at: new Date().toISOString()
    });

    writeJSON(transactionsFile, transactions);
    return res.status(tapRes.status).json(charge);




  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: err.message });
  }
});

function saveUpdateTransaction(data) {
  const transactions = readJSON(transactionsFile);

  const index = transactions.findIndex(
    t => t.tap_id === data.tap_id
  );

  if (index > -1) {
    transactions[index] = {
      ...transactions[index],
      ...data,
      updated_at: new Date().toISOString()
    };
  } else {
    transactions.push({
      ...data,
      created_at: new Date().toISOString(),
      updated_at: null
    });
  }

  writeJSON(transactionsFile, transactions);
}

//to save the customer first for save cards
function saveCustomer({ tap_customer_id, email, first_name, phone }) {
  const customers = readJSON(customersFile);

  let customer = customers.find(c => c.email === email);

  if (!customer) {
    customer = {
      tap_customer_id,
      email,
      first_name,
      phone,
      saved_cards: [],
      created_at: new Date().toISOString()
    };
    customers.push(customer);
    } else {
    // update tap customer id 
    if (!customer.tap_customer_id && tap_customer_id) {
      customer.tap_customer_id = tap_customer_id;
    }
  }
    writeJSON(customersFile, customers);
  }


//save Cards
function saveTapCard(card) {
  const customers = readJSON(customersFile);

  let customer = customers.find(c => c.email === card.email);

  if (!customer) {
    customer = { email: card.email, saved_cards: [] };
    customers.push(customer);
  }

  customer.saved_cards = customer.saved_cards || [];

  const exists = customer.saved_cards?.some(
    c => c.card_id === card.card_id
  );

  if (!exists) {

    customer.saved_cards.push(card);

    writeJSON(customersFile, customers);
  }
}


//Card API
app.post("/pay/card", async (req, res) => {
    const {
      tokenId,
      name,
      email,
      phone,
      countryCode,
      amount,
      currency,
    } = req.body;

      console.log("TOKEN RECEIVED:", tokenId);

    if (!tokenId) {
      return res.status(400).json({ error: "Missing tokenId" });
    }
saveCustomer({
    name,
    email,
    phone: `${countryCode}${phone}`
  });

    const payload = {
      amount,
      currency,
      save_card: true,
      customer: {
        first_name: name || "Guest",
        email: email,
        phone: {
          country_code: countryCode,
          number: phone
        }
      },
      source: { id: tokenId },
      redirect: {
        url: "https://rawan.tap-test.com/payment-result.html"
      },
      post: {
        url: "https://rawan.tap-test.com/payment-result.html"
      },
      description: "Card Payment"

    };

    const tapRes = await fetch("https://api.tap.company/v2/charges/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TAP_TEST_SECRET_KEY}`
      },
      body: JSON.stringify(payload)
    });

    const charge = await tapRes.json();

    if (!tapRes.ok) {
  console.log("Tap error:", charge);
  return res.status(400).json(charge);
}

      saveUpdateTransaction({ //still INITIATED
    tap_id: charge.id,
    email,
    amount: charge.amount,
    currency: charge.currency,
    status: charge.status,
    payment_method: "CARD",
    transaction_url: charge.transaction?.url || null
  });

  
console.log("FULL CHARGE FROM TAP:", JSON.stringify(charge, null, 2));

if (charge.status === "INITIATED" && charge.transaction?.url) {
    return res.json({
      status: "INITIATED",
      transaction_url: charge.transaction.url, 
      tap_id: charge.id
    });
  }

  return res.json({
    status: charge.status,
    tap_id: charge.id
  });




});


function saveKfastAgreement(charge) {
  if (!charge?.payment_agreement?.id) return;
   if (!charge?.customer?.email) return;

  const email = charge.customer.email;
  if (!email) return;

  // -------- save in kfast.json --------
  const list = readJSON(kfastFile);

  const row = {
    email,
    agreement_id: charge.payment_agreement.id,
    type: charge.payment_agreement.type,
    tap_customer_id: charge.customer.id,
    created_at: new Date().toISOString()
  };

  const idx = list.findIndex(x => x.email === email);
  if (idx >= 0) list[idx] = row;
  else list.push(row);

  writeJSON(kfastFile, list);

  // -------- attach to customer --------
  const customers = readJSON(customersFile);
  const customer = customers.find(c => c.email === email);

  if (customer) {
    customer.kfast = row;
    writeJSON(customersFile, customers);
  }
}

//Payment Status LIVEE
app.get("/payment/status", async (req, res) => {
  try {
    const { tap_id } = req.query;

    if (!tap_id || tap_id === "undefined") {
      return res.status(400).json({ error: "Missing tap_id" });
    }

    const tapRes = await fetch(
      `https://api.tap.company/v2/charges/${tap_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${process.env.TAP_TEST_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!tapRes.ok) {
  const errText = await tapRes.text();
  return res.status(200).json({
    status: "PENDING",
    message: "Charge not ready yet",
    details: errText,
  });
}


    const charge = await tapRes.json();

    console.log("-------FULL CHARGE FROM TAP AFFTER /payment/status:-------", JSON.stringify(charge, null, 2));

saveUpdateTransaction({
  tap_id: charge.id,
  status: charge.status,
  email: charge.customer?.email || null,
  amount: charge.amount,
  currency: charge.currency,
  payment_method:
    charge.source?.payment_method || charge.source?.type || null,
  transaction_url: charge.transaction?.url || null
});

  

//for card 
  if (charge.status === "CAPTURED" && charge.card) {
  
    saveTapCard({
    email: charge.customer.email,
    card_id: charge.card.id,
    brand: charge.card.brand,
    last4: charge.card.last_four,
    exp_month: charge.card.expiry.month,
    exp_year: charge.card.expiry.year
  });
  }
//for KFAST
if (charge.status === "CAPTURED" && charge.payment_agreement?.id) {
  const email = charge.metadata?.email || charge.customer?.email || null;
 saveKfastAgreement(charge);
  // saveKfastAgreement({
  //   agreement_id: charge.payment_agreement.id,
  //   first_name,///
  //   email:charge.metadata?.email
  // });
}



    return res.status(200).json({
      id: charge.id,
      status: charge.status,
      amount: charge.amount,
      currency: charge.currency,
      transaction_url: charge.transaction?.url || null,
      redirect_url:
        charge.redirect?.url || charge.transaction?.url || null,
      payment_method:
        charge.source?.payment_method || charge.source?.type || null,
    });
  } catch (err) {
    console.error("❌ /payment/status error:", err);
    return res.status(500).json({
      error: "Failed to fetch payment status",
    });
  }
});


app.get("/customer/cards", (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.status(400).json({ error: "Missing email" });
  }
  const customers = readJSON(customersFile);
  const customer = customers.find(c => c.email === email);
  res.json(customer?.saved_cards || []);

});

//1. create a cutomer to create the customer ID
app.post("/tap/customer", async (req, res) => {
  try {
    const { email, first_name, phone } = req.body;

    const tapRes = await fetch("https://api.tap.company/v2/customers", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        first_name,
        phone
      })
    });

    const customer = await tapRes.json();

    if (!customer.id) {
      return res.status(500).json(customer);
    }

     saveCustomer({
      tap_customer_id: customer.id,
      email,
      first_name,
      phone
      
    });

    return res.json(customer);

  } catch (e) {
    console.error("Create customer error:", e);
    res.status(500).json({ error: "Create customer failed" });
  }
});



//----------KNET----------
app.post("/pay/knet", async (req, res) => {
  try {
    const {
      amount,
      email,
      name,
      phone,
      customer_id // Tap customer ID
    } = req.body;

    const payload = {
      amount,
      currency: "KWD",
      threeDSecure: true,
      description: "KNET Payment",
      source: {
        id: "src_kw.knet"
      },
      redirect: {
        url: "https://rawan.tap-test.com/payment-result.html"
      },
      post: {
        url: "https://rawan.tap-test.com/payment-result.html"
      }
    };

    //there is customer id
    if (customer_id) {
      payload.customer = {
        id: customer_id
      };
    } else {
      // there is no customer id
      payload.customer = {
        email,
        name,
        phone
      };
    }

    const tapRes = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const charge = await tapRes.json();
    return res.json(charge);

  } catch (err) {
    console.error("/pay/knet error:", err);
    return res.status(500).json({ error: "KNET payment failed" });
  }
});

//KFAST API
app.post("/pay/kfast", async (req, res) => {
  try {
    const { amount, currency, email, first_name, phone ,tap_customer_id  } = req.body;
 
    const tapRes = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount,
        currency: "KWD", //in Kwait only
        description: "KFAST",
        customer: {  id: tap_customer_id },
        source: { id: "src_kw.knet" },
        payment_agreement: { type: "UNSCHEDULED" }, 
        redirect: { url: "https://rawan.tap-test.com/payment-result.html" },
        metadata: { email } 
      })
    });

    const charge = await tapRes.json();
    return res.json(charge);

  } catch (e) {
    console.error("❌ /pay/kfast error:", e);
    return res.status(500).json({ error: "KFAST failed" });
  }
});


app.post("/pay/kfast/charge", async (req, res) => {
  try {
    const { amount, currency, agreement_id } = req.body;

    if (!agreement_id) {
      return res.status(400).json({ error: "Missing agreement_id" });
    }

    const tapRes = await fetch("https://api.tap.company/v2/charges", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        amount,
        currency: "KWD",
        payment_agreement: { id: agreement_id } 
      })
    });

    const charge = await tapRes.json();
    return res.json(charge);

  } catch (e) {
    console.error("❌ /pay/kfast/charge error:", e);
    return res.status(500).json({ error: "KFAST charge failed" });
  }
});


//=================== Platform Onboarding process ===================
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
        Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
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

//2.Create lead API
app.post("/create-lead", async (req, res) => {
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
      brand: {
        name: {
          en: brandName,
          ar: brandName
        },
        logo: files.marchantLOGO,
        operations: {
          sales: {
            period: "monthly",
            range: {
              from: "10000",
              to: "80000"
            },
            currency: "KWD"
          }
        },
        terms: [
          { term: "general", agree: true },
          { term: "chargeback", agree: true },
          { term: "refund", agree: true }
        ],
        channel_services: [
          { channel: "web", address: "" }
        ]
      },

      entity: {
        country,
        is_licensed: true,
        license: {
          number: "123456789",
          country,
          type: "commercial_registration",
          documents: [
            {
              name: "commercial_registration",
              images: [files.trade_license]
            }
          ]
        }
      },

      user: {
        name: {
          first: user.firstName,
          last: user.lastName,
          lang: "en"
        },
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
        ],
        identification: {
          number: user.identification_id,
          type: "national_id",
          issuer: country,
           images: [
            files.owner_id_front,
            files.owner_id_back
          ]
        },
        primary: true
      },

      wallet: {
        bank: {
          account: {
            iban
          }
        }
      },

      platforms: ["commerce_platform_0Rn451261446Zdok3mM1h910"]
    };

    const tapRes = await fetch("https://api.tap.company/v3/connect/lead/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAP_PLATFORM_SECRET_KEY}`,
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

//3.Convert lead API 
app.post("/convert-lead", async (req, res) => {
  try {
    const { lead_id } = req.body;

    if (!lead_id ) { //add the identification_id
      return res.status(400).json({ error: "lead_id is required" });
    }

    const tapRes = await fetch(//
      "https://api.tap.company/v3/connect/account",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TAP_PLATFORM_SECRET_KEY}`,
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


///Connect URL API 
app.post("/connectURL", async (req, res) => {
  try {
    const { lead_id } = req.body;

    if (!lead_id) {
      return res.status(400).json({ error: "lead_id is required" });
    }

    const tapRes = await fetch("https://api.tap.company/v3/connect/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TAP_PLATFORM_SECRET_KEY}`,
        "Content-Type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        scope: "auth",
        data: ["operator", "brand", "entity", "merchant"],
        lead: { id: lead_id },
        board: { display: true, editable: true },
        redirect: {
          url: "https://rawan.tap-test.com/onboarding.html"
        },
        post: {
          url: "https://rawan.tap-test.com/onboarding.html"
        },
        interface: {
         direction: "rtl",
          locale: "en",
          edges: "curved"
        }
        // platforms: ["commerce_platform_0Rn451261446Zdok3mM1h910"]
      })
    });

    const data = await tapRes.json();

    if (!tapRes.ok) {
      console.error("Tap error:", data);
      return res.status(400).json(data);
    }

    const connectUrl = data?.connect?.url;

    if (!connectUrl) {
      return res.status(400).json({
        error: "Connect URL not found",
        tap_response: data
      });
    }

    return res.json({
      connect_url: connectUrl
    });

  } catch (err) {
    console.error("Connect URL error:", err);
    res.status(500).json({ error: "Failed to generate Connect URL" });
  }
});



//Retrieve merchant list under the platform
app.post("/merchant/list", async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.body;

    const tapRes = await fetch(
      "https://api.tap.company/v2/merchant/list",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TAP_PLATFORM_SECRET_KEY}`, // SUPER KEY
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

    res.json(data);

  } catch (err) {
    console.error("Merchant list error:", err);
    res.status(500).json({
      error: "Failed to fetch merchant list"
    });
  }
});


//Retrieve merchant status under the platform
// app.get("/merchant/status", async (req, res) => {
//   try {
    
//     const { merchant_id } = req.query;
//     console.log("merchant_id", merchant_id); 

//     if (!merchant_id) {
//       return res.status(400).json({ error: "Missing merchant_id" });
//     }


//     const r = await fetch(
//       `https://api.tap.company/v2/merchant/${merchant_id}`,
//       {
//         method: "GET",
//         headers: {
//           Authorization: `Bearer ${process.env.TAP_SECRET_KEY}`,
//           Accept: "application/json"
//         }
//       }
//     );
//    const text = await tapRes.text();

//     if (!tapRes.ok) {
//       console.error("Tap error:", text);
//       return res.status(tapRes.status).json({
//         error: "Tap error",
//         raw: text
//       });
//     }

//     const data = JSON.parse(text);
//     return res.json(data);

//   } catch (e) {
//     console.error(e);
//     console.error("Merchant status error:", e);
//     res.status(500).json({ error: "Failed to retrieve merchant" });
//   }
// });


//Retrieve merchant status under the platform API
app.get("/merchant/status", async (req, res) => {
  try {
    const { merchant_id } = req.query;
    console.log("merchant_id:", merchant_id);

    if (!merchant_id) {
      return res.status(400).json({ error: "Missing merchant_id" });
    }

    const tapRes = await fetch(
      `https://api.tap.company/v2/merchant/${merchant_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${SUPER_KEY}`,
          Accept: "application/json",
        },
      }
    );

    const text = await tapRes.text();

    if (!tapRes.ok) {
      console.error("Tap error:", text);
      return res.status(tapRes.status).json({
        error: "Tap error",
        raw: text,
      });
    }

    const data = JSON.parse(text);
    return res.json(data);
  } catch (e) {
    console.error("Merchant status error:", e);
    res.status(500).json({ error: "Failed to retrieve merchant" });
  }
});

// app.listen(3000, () => {
//   console.log("✅ Server running on http://localhost:3000");
// });

// ==================MARKETPLACE==================

let retailerSplits = {}; 


let marketplaceConfig = {
  percentage: 0
};



//1.FILE API
app.post("/upload-kycMarketplace", upload.single("file"), async (req, res) => {
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



const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
