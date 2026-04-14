const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require("discord.js");
const { google } = require("googleapis");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// ---- ROLES ----
const ADMIN_ROLES = ["PSC", "Crew Leader", "Underboss", "Boss"];
const MEMBER_ROLE = "Knox";

function hasAdminRole(member) {
  return member.roles.cache.some(role => ADMIN_ROLES.includes(role.name));
}

function hasMemberRole(member) {
  return member.roles.cache.some(role => role.name === MEMBER_ROLE);
}

// ---- GOOGLE AUTH ----
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});

async function getSheetsClient() {
  return google.sheets({ version: "v4", auth: await auth.getClient() });
}

// ---- MINING SHEET ----
async function addToSheet(discordUser, name, item, amount) {
  const sheets = await getSheetsClient();
  const timestamp = new Date().toISOString();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "Sheet1!A:E",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[timestamp, discordUser, name, item, amount]]
    }
  });
}

// ---- STOCK PERSISTENCE (Google Sheets "Stock" tab) ----
async function loadStockFromSheet() {
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "Stock!A:B"
    });

    const rows = res.data.values || [];
    const stock = {};

    for (let i = 1; i < rows.length; i++) {
      const [item, amount] = rows[i];
      if (item) stock[item] = amount ?? "Not set";
    }

    return stock;
  } catch (err) {
    console.error("Failed to load stock from sheet:", err);
    return {};
  }
}

async function saveStockToSheet(stock) {
  try {
    const sheets = await getSheetsClient();

    const rows = [["Item", "Amount"]];
    for (const item of materialItems) {
      rows.push([item, stock[item] ?? "Not set"]);
    }

    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.SHEET_ID,
      range: "Stock!A:B"
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: "Stock!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows }
    });
  } catch (err) {
    console.error("Failed to save stock to sheet:", err);
  }
}

// ---- TODO PERSISTENCE (Google Sheets "Todo" tab) ----
async function loadTodoFromSheet() {
  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.SHEET_ID,
      range: "Todo!A:A"
    });

    const rows = res.data.values || [];
    // Skip header row, return just the task strings
    return rows.slice(1).map(row => row[0]).filter(Boolean);
  } catch (err) {
    console.error("Failed to load todo from sheet:", err);
    return [];
  }
}

async function saveTodoToSheet(list) {
  try {
    const sheets = await getSheetsClient();

    const rows = [["Task"], ...list.map(task => [task])];

    await sheets.spreadsheets.values.clear({
      spreadsheetId: process.env.SHEET_ID,
      range: "Todo!A:A"
    });

    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: "Todo!A1",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rows }
    });
  } catch (err) {
    console.error("Failed to save todo to sheet:", err);
  }
}

// ---- MENU DATA ----
const menuCategories = [
  {
    name: "💎 Per 1,000",
    items: [
      { name: "High Grade", price: "500k" },
      { name: "Heroin", price: "500k" },
      { name: "Crack", price: "500k" },
      { name: "LSD", price: "375k" },
      { name: "MDMA", price: "375k" },
      { name: "Weed", price: "50k" },
      { name: "Coke", price: "N/A" },
    ]
  },
  {
    name: "🧱 Materials per box",
    items: [
      { name: "Iron Ore", price: "16k" },
      { name: "Coal Ore", price: "7k" },
      { name: "Aluminium Ore", price: "8.7k" },
      { name: "Iron Bar", price: "19k" },
      { name: "Coal Coke", price: "12k" },
      { name: "Steel Bar", price: "21k" },
      { name: "Aluminium Bar", price: "19.3k" },
    ]
  }
];

// ---- FUZZY MATCH ----
function fuzzyMatchMaterial(input) {
  const normalised = input.toLowerCase().trim();

  const exact = materialItems.find(m => m.toLowerCase() === normalised);
  if (exact) return exact;

  const partial = materialItems.find(m => m.toLowerCase().includes(normalised) || normalised.includes(m.toLowerCase()));
  if (partial) return partial;

  const inputWords = normalised.split(/\s+/);
  let bestMatch = null;
  let bestScore = 0;

  for (const material of materialItems) {
    const materialWords = material.toLowerCase().split(/\s+/);
    const commonWords = inputWords.filter(w => materialWords.includes(w));
    const score = commonWords.length / Math.max(inputWords.length, materialWords.length);
    if (score > bestScore && score >= 0.5) {
      bestScore = score;
      bestMatch = material;
    }
  }

  return bestMatch;
}

// ---- MATERIAL ITEMS ----
const materialItems = [
  "Iron Ore", "Coal Ore", "Aluminium Ore",
  "Iron Bar", "Coal Coke", "Steel Bar", "Aluminium Bar"
];

// In-memory caches — loaded from Sheets on startup
let stockNeeded = {};
let todoList = [];

// ---- REGISTER SLASH COMMANDS ----
const commands = [
  new SlashCommandBuilder()
    .setName("mining")
    .setDescription("Submit your mining completion"),
  new SlashCommandBuilder()
    .setName("menu")
    .setDescription("View the price list"),
  new SlashCommandBuilder()
    .setName("knox")
    .setDescription("Knox on top...5 times?"),
  new SlashCommandBuilder()
    .setName("stock")
    .setDescription("View how much of each material is needed"),
  new SlashCommandBuilder()
    .setName("setstock")
    .setDescription("Set the amount needed for a material (Admin only)")
    .addStringOption(option =>
      option.setName("item")
        .setDescription("Which material?")
        .setRequired(true)
        .addChoices(
          ...materialItems.map(item => ({ name: item, value: item }))
        )
    )
    .addStringOption(option =>
      option.setName("amount")
        .setDescription("How much is needed?")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("clearstock")
    .setDescription("Clear the entire stock list (Admin only)"),
  new SlashCommandBuilder()
    .setName("todo")
    .setDescription("View the current to-do list"),
  new SlashCommandBuilder()
    .setName("addtodo")
    .setDescription("Add a task to the to-do list (Admin only)")
    .addStringOption(option =>
      option.setName("task")
        .setDescription("What needs doing?")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("removetodo")
    .setDescription("Remove a task from the to-do list by its number (Admin only)")
    .addIntegerOption(option =>
      option.setName("number")
        .setDescription("Which task number to remove? (use /todo to see numbers)")
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName("cleartodo")
    .setDescription("Clear the entire to-do list (Admin only)")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Load both stock and todo from Google Sheets on startup
  stockNeeded = await loadStockFromSheet();
  console.log("Stock loaded from Google Sheets:", stockNeeded);

  todoList = await loadTodoFromSheet();
  console.log("Todo loaded from Google Sheets:", todoList);

  const guildIds = ["1449801196893241455", "1430968926480629825"];
  for (const guildId of guildIds) {
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body: commands }
    );
  }
  console.log("Slash commands registered.");
});

// ---- INTERACTIONS ----
client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {

    const adminCommands = ["setstock", "clearstock", "addtodo", "removetodo", "cleartodo"];
    const memberCommands = ["mining", "menu", "knox", "stock", "todo"];

    const isAdminCommand = adminCommands.includes(interaction.commandName);
    const isMemberCommand = memberCommands.includes(interaction.commandName);

    if (isAdminCommand && !hasAdminRole(interaction.member)) {
      return await interaction.reply({
        content: `❌ You need one of the following roles to use this command: **${ADMIN_ROLES.join(", ")}**.`,
        flags: 64
      });
    }

    if (isMemberCommand && !hasMemberRole(interaction.member) && !hasAdminRole(interaction.member)) {
      return await interaction.reply({
        content: `❌ You need the **${MEMBER_ROLE}** role to use this command.`,
        flags: 64
      });
    }

    // /mining command
    if (interaction.commandName === "mining") {
      const modal = new ModalBuilder()
        .setCustomId("miningForm")
        .setTitle("Mining Completion Form");
      const nameInput = new TextInputBuilder()
        .setCustomId("name")
        .setLabel("What is your name?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const itemInput = new TextInputBuilder()
        .setCustomId("item")
        .setLabel("What did you get?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("How much?")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(itemInput),
        new ActionRowBuilder().addComponents(amountInput)
      );
      await interaction.showModal(modal);
    }

    // /menu command
    if (interaction.commandName === "menu") {
      const embed = new EmbedBuilder()
        .setTitle("📋 Price List")
        .setColor(0xf5a623)
        .setFooter({ text: "All prices are subject to change" })
        .setTimestamp();

      for (const category of menuCategories) {
        const itemList = category.items
          .map(item => `**${item.name}** — ${item.price} coins`)
          .join("\n");
        embed.addFields({ name: category.name, value: itemList });
      }

      await interaction.reply({ embeds: [embed] });
    }

    // /knox command
    if (interaction.commandName === "knox") {
      await interaction.reply("Knox on top...5 times?");
    }

    // /stock command
    if (interaction.commandName === "stock") {
      const embed = new EmbedBuilder()
        .setTitle("🧱 Materials Needed")
        .setColor(0x3498db)
        .setFooter({ text: "Set by admins using /setstock" })
        .setTimestamp();

      const itemList = materialItems.map(item => {
        const needed = stockNeeded[item] ?? "Not set";
        return `**${item}** — ${needed}`;
      }).join("\n");

      embed.addFields({ name: "Amount Needed per Item", value: itemList });
      await interaction.reply({ embeds: [embed] });
    }

    // /setstock command
    if (interaction.commandName === "setstock") {
      const item = interaction.options.getString("item");
      const amount = interaction.options.getString("amount");
      stockNeeded[item] = amount;
      await saveStockToSheet(stockNeeded);

      await interaction.reply({
        content: `✅ Updated! **${item}** now needs **${amount}**.`,
        flags: 64
      });
    }

    // /clearstock command
    if (interaction.commandName === "clearstock") {
      for (const key of Object.keys(stockNeeded)) {
        delete stockNeeded[key];
      }
      await saveStockToSheet(stockNeeded);

      await interaction.reply({
        content: "🗑️ Stock list has been cleared. All items are now set to **Not set**.",
        flags: 64
      });
    }

    // /todo command
    if (interaction.commandName === "todo") {
      const embed = new EmbedBuilder()
        .setTitle("✅ To-Do List")
        .setColor(0x2ecc71)
        .setFooter({ text: "Managed by admins using /addtodo and /removetodo" })
        .setTimestamp();

      if (todoList.length === 0) {
        embed.setDescription("Nothing to do — the list is empty!");
      } else {
        const taskList = todoList
          .map((task, index) => `**${index + 1}.** ${task}`)
          .join("\n");
        embed.setDescription(taskList);
      }

      await interaction.reply({ embeds: [embed] });
    }

    // /addtodo command
    if (interaction.commandName === "addtodo") {
      const task = interaction.options.getString("task");
      todoList.push(task);
      await saveTodoToSheet(todoList);

      await interaction.reply({
        content: `✅ Added to the to-do list: **${task}**`,
        flags: 64
      });
    }

    // /removetodo command
    if (interaction.commandName === "removetodo") {
      const number = interaction.options.getInteger("number");
      if (number < 1 || number > todoList.length) {
        return await interaction.reply({
          content: `❌ Invalid task number. Use **/todo** to see the current list.`,
          flags: 64
        });
      }

      const removed = todoList.splice(number - 1, 1)[0];
      await saveTodoToSheet(todoList);

      await interaction.reply({
        content: `🗑️ Removed task **${number}**: **${removed}**`,
        flags: 64
      });
    }

    // /cleartodo command
    if (interaction.commandName === "cleartodo") {
      todoList.length = 0;
      await saveTodoToSheet(todoList);

      await interaction.reply({
        content: "🗑️ To-do list has been cleared.",
        flags: 64
      });
    }
  }

  // Modal submission — also requires Knox role (or admin)
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "miningForm") {

      if (!hasMemberRole(interaction.member) && !hasAdminRole(interaction.member)) {
        return await interaction.reply({
          content: `❌ You need the **${MEMBER_ROLE}** role to submit this form.`,
          flags: 64
        });
      }

      const name = interaction.fields.getTextInputValue("name");
      const item = interaction.fields.getTextInputValue("item");
      const amount = interaction.fields.getTextInputValue("amount");

      try {
        await addToSheet(interaction.user.tag, name, item, amount);

        // ---- STOCK DEDUCTION ----
        let stockMessage = "";
        const submittedAmount = parseInt(amount, 10);
        const matchedMaterial = fuzzyMatchMaterial(item);

        if (matchedMaterial && !isNaN(submittedAmount)) {
          const currentStock = stockNeeded[matchedMaterial];

          if (currentStock !== undefined) {
            const currentAmount = parseInt(currentStock, 10);

            if (!isNaN(currentAmount)) {
              const newAmount = Math.max(0, currentAmount - submittedAmount);
              stockNeeded[matchedMaterial] = String(newAmount);
              await saveStockToSheet(stockNeeded);

              const wasGuessed = matchedMaterial.toLowerCase() !== item.toLowerCase().trim();
              const matchNote = wasGuessed ? ` *(matched to **${matchedMaterial}**)*` : "";
              stockMessage = `\n📦 Stock updated: **${matchedMaterial}**${matchNote} — ${currentAmount} → **${newAmount}** remaining`;

              if (newAmount === 0) {
                stockMessage += "\n✅ **Stock fully filled for this item!**";
              }
            }
          }
        }

        await interaction.reply({
          content: `✅ Submitted!\n**Name:** ${name}\n**Item:** ${item}\n**Amount:** ${amount}${stockMessage}`,
          flags: 64
        });
      } catch (err) {
        console.error(err);
        await interaction.reply({
          content: "❌ Failed to upload to Google Sheets. Check bot console.",
          flags: 64
        });
      }
    }
  }
});

// ---- PREFIX COMMANDS (! commands, open to everyone) ----
client.on("messageCreate", (message) => {
  if (message.author.bot) return;

  const content = message.content.trim().toLowerCase();

  if (content === "!slav") {
    message.reply("A high usage of X-Ray goggles has been reported.");
  }

    if (content === "!jackwhite") {
    message.reply("Jack White AKA Tony Meakins Lover.");
  }

  if (content === "!barry") {
    message.reply("Barry Island is the home of Knox Underboss, Tony Meakin");
  }

  if (content === "!67") {
    message.reply("676767676767676767676767676767676767676767676767");
  }

  if (content === "!idk") {
    message.reply("You should refer yourself to finding out in Roleplay");
  }

  if (content === "!wales") {
    message.reply("Sheep sheep sheep sheep sheep");
  }

  if (content === "!wartime") {
    message.reply("See you on the forums, WARRIOR");
  }

  if (content === "!jellyhead") {
    message.reply("A Jellyhead is a term popularised by Mr Tony, no one really knows what it means but we all get it");
  }

  if (content === "!sam") {
    message.reply("Killed by rose faux for being bad at trivia");
  }

  if (content === "!clinton") {
    message.reply("put on the map by Mr Freddie Loo");
  }
});

client.login(process.env.TOKEN);
