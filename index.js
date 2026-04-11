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
  EmbedBuilder  // ← added
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

// ---- REGISTER SLASH COMMANDS ----
const commands = [
  new SlashCommandBuilder()
    .setName("mining")
    .setDescription("Submit your mining completion"),
  new SlashCommandBuilder()       // ← added
    .setName("menu")
    .setDescription("View the price list")
].map(cmd => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const guildId = "1449801196893241455";
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, guildId),
    { body: commands }
  );
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

    // /menu command ← added
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
          flags: 64  // ← also fixed the ephemeral deprecation warning you were getting
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