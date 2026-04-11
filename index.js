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
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---- GOOGLE AUTH ----
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"]
});
async function addToSheet(discordUser, name, item, amount) {
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });
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
      { name: "Iron Ore", price: "8.7k" },
      { name: "Coal Ore", price: "7.5k" },
      { name: "Aluminium Ore", price: "8.7k" },
      { name: "Iron Bar", price: "19.3k" },
      { name: "Coal Coke", price: "12.5k" },
      { name: "Steel Bar", price: "21.2k" },
      { name: "Aluminium Bar", price: "19.3k" },
    ]
  }
];

// ---- STOCK STORAGE ----
// Stores { itemName: amountNeeded } e.g. { "Iron Ore": "500" }
const stockNeeded = {};

// All material names for the slash command choices
const materialItems = [
  "Iron Ore", "Coal Ore", "Aluminium Ore",
  "Iron Bar", "Coal Coke", "Steel Bar", "Aluminium Bar"
];

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
    )
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const guildIds = ["1449801196893241455", "YOUR_FRIENDS_SERVER_ID_HERE"];
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
      // ---- Change "YOUR_ROLE_NAME" to your actual role name ----
      const allowedRoleName = "PSC";

      const hasRole = interaction.member.roles.cache.some(
        role => role.name === allowedRoleName
      );

      if (!hasRole) {
        return await interaction.reply({
          content: `❌ You need the **${allowedRoleName}** role to use this command.`,
          flags: 64
        });
      }

      const item = interaction.options.getString("item");
      const amount = interaction.options.getString("amount");
      stockNeeded[item] = amount;

      await interaction.reply({
        content: `✅ Updated! **${item}** now needs **${amount}**.`,
        flags: 64
      });
    }
  }

  // Modal submission
  if (interaction.isModalSubmit()) {
    if (interaction.customId === "miningForm") {
      const name = interaction.fields.getTextInputValue("name");
      const item = interaction.fields.getTextInputValue("item");
      const amount = interaction.fields.getTextInputValue("amount");
      try {
        await addToSheet(interaction.user.tag, name, item, amount);
        await interaction.reply({
          content: `✅ Submitted!\n**Name:** ${name}\n**Item:** ${item}\n**Amount:** ${amount}`,
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

client.login(process.env.TOKEN);