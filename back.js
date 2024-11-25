const express = require('express');
const { Pool } = require('pg');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const cron = require('node-cron');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');


const app = express();
app.use(bodyParser.json());
app.use(cookieParser()); // Pour lire les cookies
app.use(session({
  secret: 'votre_secret_de_session', // Changez cette clé pour quelque chose de plus sécurisé
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false } // Passez à true si vous utilisez HTTPS
}));

// Configuration de la connexion à PostgreSQL
const pool = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: 'angeluc', // Remplacez par votre mot de passe PostgreSQL
  database: 'postgres',
  port: 5432, // Port par défaut pour PostgreSQL
});

// Configuration de Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'tsila.ramiaramanana@gmail.com', // Remplacez par votre email
    pass: 'xlkq roul svgs xkgi', // Remplacez par votre mot de passe ou un mot de passe d'application
  },
});

const cors = require('cors');

app.use(cors({
  origin: 'http://localhost:3000', // Remplace par l'URL de ton frontend
  credentials: true
}));

app.use(session({
  secret: 'votre_secret_de_session',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Passe à true pour HTTPS
    maxAge: 30 * 1000 // 30 secondes en millisecondes
  }
}));



app.get('/api/check-auth', (req, res) => {
  if (req.session.user) {
    res.json({ authenticated: true, user: req.session.user });
  } else {
    res.status(401).json({ authenticated: false });
  }
});


// Fonction pour envoyer un email
function envoyerEmail(client) {
  const mailOptions = {
    from: 'tsila.ramiaramanana@gmail.com',
    to: client.email,
    subject: 'Fin de votre séjour',
    text: `Bonjour ${client.nom}, votre séjour a pris fin. Merci de nous avoir choisis!`,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Erreur lors de l\'envoi de l\'email:', error);
      return;
    }
    console.log('Email envoyé:', info.response);
  });
}

function envoyerEmailAvecBillet(client) {
  const mailOptions = {
    from: 'tsila.ramiaramanana@gmail.com',
    to: client.email,
    subject: 'Votre réservation a été confirmée',
    text: `Bonjour ${client.nom}, veuillez trouver ci-joint votre billet de réservation.`,
    attachments: [
      {
        filename: 'billet.pdf',
        path: path.join(__dirname, 'billet', 'billet.pdf'), // Chemin du fichier PDF
        contentType: 'application/pdf',
      },
      {
        filename: 'carte.png',
        path: path.join(__dirname, 'billet', 'carte.png'), // Chemin de l'image PNG
        contentType: 'image/png',
      },
    ],
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error('Erreur lors de l\'envoi de l\'email:', error);
      return;
    }
    console.log('Email envoyé:', info.response);
  });
}

const ExcelJS = require('exceljs');

async function exporterReservations() {
  try {
    const { rows: reservations } = await pool.query(`
      SELECT reservations.*, client.nom_client, client.email_client, client.numero_client, bungalows.type AS type_bungalow
      FROM reservations
      JOIN client ON reservations.client_id = client.client_id
      JOIN bungalows ON reservations.bungalow_id = bungalows.id
    `);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Réservations');

    worksheet.columns = [
      { header: 'ID Réservation', key: 'id', width: 15 },
      { header: 'Nom du Client', key: 'nom_client', width: 25 },
      { header: 'Email du Client', key: 'email_client', width: 25 },
      { header: 'Numéro du Client', key: 'numero_client', width: 20 },
      { header: 'Type de Bungalow', key: 'type_bungalow', width: 20 },
      { header: 'Date de Réservation', key: 'datereservation', width: 20 },
      { header: 'Durée du Séjour', key: 'dureesejour', width: 15 },
      { header: 'Statut', key: 'statut', width: 15 },
      { header: 'Prix Payé', key: 'prix_paye', width: 15 }
    ];

    reservations.forEach(reservation => {
      worksheet.addRow(reservation);
    });

    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); 
    const day = String(date.getDate()).padStart(2, '0'); 
    const formattedDate = `${year}-${month}-${day}`;

    const filePath = path.join(__dirname, 'exports', `reservations_${formattedDate}.xlsx`);

    await workbook.xlsx.writeFile(filePath);

    console.log('Fichier Excel généré avec succès:', filePath);

    return filePath;

  } catch (error) {
    console.error('Erreur lors de l\'exportation des réservations:', error);
    throw error;
  }
}
let lastSentDate = null; // Variable pour stocker la date de l'envoi précédent

async function envoyerReservationsParEmail() {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Vérifier si un email a déjà été envoyé ce mois-ci
    if (lastSentDate) {
      const lastSentMonth = lastSentDate.getMonth();
      const lastSentYear = lastSentDate.getFullYear();

      // Comparer les mois et les années
      if (lastSentMonth === currentMonth && lastSentYear === currentYear) {
        console.log("L'email a déjà été envoyé ce mois-ci.");
        return; // Ne pas envoyer l'email si déjà envoyé
      }
    }

    // Exporter les réservations dans un fichier Excel
    const filePath = await exporterReservations();

    // Configurer l'email avec le fichier Excel en pièce jointe
    const mailOptions = {
      from: 'tsila.ramiaramanana@gmail.com', // Votre email
      to: 'patron@example.com', // Email du patron
      subject: 'Rapport des réservations',
      text: 'Veuillez trouver ci-joint le fichier Excel contenant les réservations.',
      attachments: [
        {
          filename: path.basename(filePath), // Nom du fichier
          path: filePath, // Chemin du fichier
        },
      ],
    };

    // Envoyer l'email
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Erreur lors de l\'envoi de l\'email:', error);
        return;
      }
      console.log('Email envoyé avec succès:', info.response);
      lastSentDate = new Date(); // Mettre à jour la date de l'envoi
      console.log(`L'email a été envoyé pour la dernière fois le : ${lastSentDate.toISOString()}`); // Afficher la date de l'envoi
    });

  } catch (error) {
    console.error('Erreur lors de l\'envoi des réservations par email:', error);
  }
}

// Planifier l'envoi des réservations par email tous les mois (1er jour du mois à 8h)
cron.schedule('0 8 1 * *', envoyerReservationsParEmail);


// Fonction pour vérifier les séjours
async function verifierSejours() {
  const maintenant = new Date();

  try {
    // Requête pour récupérer les réservations terminées et leurs informations client
    const { rows: reservations } = await pool.query(`
      SELECT reservations.*, client.nom_client, client.email_client, client.numero_client
      FROM reservations 
      JOIN client ON reservations.client_id = client.client_id
      WHERE DATE(dateReservation + INTERVAL '1 day' * dureeSejour) <= $1 
      AND emailenvoye = FALSE
    `, [maintenant]);

    for (const reservation of reservations) {
      // Envoyer un email au client avec les détails
      console.log(reservation.nom_client, reservation.email_client);
      await envoyerEmail({
        nom: reservation.nom_client,
        email: reservation.email_client,
        bungalowId: reservation.bungalow_id
      });

      // Mettre à jour le statut de la réservation et l'indicateur d'email envoyé
      await pool.query(
        `UPDATE reservations 
         SET statut = $1, emailenvoye = $2 
         WHERE id = $3`,
        ['terminé', true, reservation.id]
      );

      // Mettre à jour la disponibilité du bungalow
      await pool.query(
        `UPDATE bungalows 
         SET disponibilite = TRUE 
         WHERE id = $1`,
        [reservation.bungalow_id]
      );
    }

    console.log('Vérification des séjours effectuée avec succès');
  } catch (err) {
    console.error('Erreur lors de la vérification des réservations:', err);
  }
}


// Planifier une tâche pour vérifier les séjours terminés tous les jours à minuit
cron.schedule('0 0 * * *', verifierSejours);

// Appeler la fonction de vérification immédiatement pour le test
verifierSejours();

// Middleware pour vérifier si l'utilisateur est authentifié
function isAuthenticated(req, res, next) {
  if (req.session.user) {
    return next(); // L'utilisateur est authentifié, continuez
  }
  res.status(401).json({ message: 'Vous devez être connecté pour accéder à cette ressource.' });

}

//ajouter une reservation
app.post('/api/reservations',isAuthenticated ,async (req, res) => {
  const { nom_client, email_client, dateReservation, dureeSejour, personnes, modepaiement, bungalow_id, numero_client, prix_paye } = req.body;

  try {
    // Vérifier la disponibilité du bungalow
    const { rows: bungalows } = await pool.query('SELECT disponibilite FROM bungalows WHERE id = $1', [bungalow_id]);

    if (bungalows.length === 0) {
      return res.status(404).json({ message: 'Bungalow non trouvé' });
    }

    if (!bungalows[0].disponibilite) {
      return res.status(400).json({ message: 'Le bungalow est déjà réservé' });
    }

    const { rows: existingClient } = await pool.query('SELECT client_id FROM client WHERE email_client = $1', [email_client]);

    let client_id;

    if (existingClient.length === 0) {
      const { rows: newClient } = await pool.query(
        'INSERT INTO client (nom_client, email_client, numero_client) VALUES ($1, $2, $3) RETURNING client_id',
        [nom_client, email_client, numero_client]
      );
      client_id = newClient[0].client_id;
    } else {
      // Si le client existe, récupérer son ID
      client_id = existingClient[0].client_id;
    }

    // Ajouter la réservation avec le client_id
    await pool.query(
      `INSERT INTO reservations (client_id, dateReservation, dureeSejour, statut, personnes, modepaiement, bungalow_id, prix_paye) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [client_id, dateReservation, dureeSejour, 'en cours', personnes, modepaiement, bungalow_id, prix_paye]
    );

    // Mettre à jour la disponibilité du bungalow
    await pool.query('UPDATE bungalows SET disponibilite = FALSE WHERE id = $1', [bungalow_id]);

    const client = { nom: nom_client, email: email_client, dateReservation, dureeSejour, personnes, modepaiement };
    // Envoyer l'email avec le billet en pièce jointe
    envoyerEmailAvecBillet(client);

    console.log('Email envoyé à', client.email);

    res.json({ message: 'Réservation ajoutée avec succès' });
  } catch (err) {
    console.error('Erreur lors de l\'ajout de la réservation:', err);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// Endpoint pour récupérer les informations du client par email
app.get('/api/clients/:nom', async (req, res) => {
  const { nom } = req.params;

  try {
    const { rows: client } = await pool.query('SELECT nom_client, email_client, numero_client FROM client WHERE nom_client = $1', [nom]);

    if (client.length === 0) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    console.log(client)

    res.json(client[0]);
  } catch (err) {
    console.error('Erreur lors de la récupération des informations du client:', err);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});




// Route pour récupérer toutes les réservations avec les détails des bungalows (protégée)
app.get('/api/reservations', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT reservations.*, bungalows.type AS type_bungalow, 
             client.nom_client, client.email_client, client.numero_client
      FROM reservations
      LEFT JOIN bungalows ON reservations.bungalow_id = bungalows.id
      LEFT JOIN client ON reservations.client_id = client.client_id
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur lors de la récupération des réservations:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// Route pour mettre à jour une réservation
app.put('/api/reservations/:id', isAuthenticated, async (req, res) => {
  const id = req.params.id;
  const { nom_client, email_client, dateReservation, dureeSejour, statut } = req.body;

  try {
    await pool.query(
      `UPDATE reservations 
       SET nom_client = $1, email_client = $2, dateReservation = $3, dureeSejour = $4, statut = $5 
       WHERE id = $6`,
      [nom_client, email_client, dateReservation, dureeSejour, statut, id]
    );
    res.json({ message: 'Réservation mise à jour avec succès' });
  } catch (err) {
    console.error('Erreur lors de la mise à jour de la réservation:', err);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// Route pour supprimer une réservation
app.delete('/api/reservations/:id', isAuthenticated, async (req, res) => {
  const id = req.params.id;

  try {
    // Récupérer l'ID du bungalow lié à la réservation
    const { rows: reservation } = await pool.query('SELECT bungalow_id FROM reservations WHERE id = $1', [id]);

    if (reservation.length === 0) {
      return res.status(404).json({ message: 'Réservation non trouvée' });
    }

    const bungalow_id = reservation[0].bungalow_id;

    // Supprimer la réservation
    await pool.query('DELETE FROM reservations WHERE id = $1', [id]);

    // Rétablir la disponibilité du bungalow
    await pool.query('UPDATE bungalows SET disponibilite = TRUE WHERE id = $1', [bungalow_id]);

    res.json({ message: 'Réservation supprimée avec succès' });
  } catch (err) {
    console.error('Erreur lors de la suppression de la réservation:', err);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// Route pour obtenir toutes les informations sur les bungalows
app.get('/api/bungalows', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM bungalows');
    res.json(result.rows);
  } catch (err) {
    console.error('Erreur lors de la récupération des bungalows:', err);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// Route pour obtenir le nombre total de bungalows
app.get('/api/bungalows/count', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT COUNT(*) AS total FROM bungalows');
    const totalBungalows = parseInt(rows[0].total, 10);
    res.json({ totalBungalows });
  } catch (err) {
    console.error('Erreur lors de la récupération du nombre de bungalows:', err);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});

// Route de connexion (login)
app.post('/api/login', async (req, res) => {
  const { identifiant, password } = req.body;

  try {
    // Vérifie si l'utilisateur existe dans la base de données en cherchant soit par email soit par numéro de téléphone
    const query = `
      SELECT * FROM utilisateurs 
      WHERE email = $1 OR numero = $2
    `;
    const { rows } = await pool.query(query, [identifiant, identifiant]);
    
    if (rows.length === 0) {
      return res.status(400).json({ message: 'Utilisateur non trouvé' });
    }

    const user = rows[0];

    // Compare le mot de passe envoyé avec celui haché dans la base de données
    const passwordMatch = await bcrypt.compare(password, user.mot_de_passe);
    
    if (!passwordMatch) {
      return res.status(401).json({ message: 'Mot de passe incorrect' });
    }

    // Enregistrer les informations de l'utilisateur dans la session
    req.session.user = {
      id: user.id,
      nom: user.nom,
      fonction: user.fonction,
      email: user.email
    };

    // Si la connexion est réussie, renvoyer les informations utilisateur
    res.json({ message: 'Connexion réussie', user: req.session.user });
  } catch (err) {
    console.error('Erreur lors de la tentative de connexion:', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
});

// Route de déconnexion (logout)
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ message: 'Erreur lors de la déconnexion' });
    }
    res.json({ message: 'Déconnexion réussie' });
  });
});

const crypto = require('crypto'); // Pour générer des tokens uniques

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const { rows } = await pool.query('SELECT * FROM utilisateurs WHERE email = $1', [email]);
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' });
    }

    const user = rows[0];
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
    const maintenant = new Date();

    const resetTokenExpiry = new Date(maintenant.getTime() + 900000); // 15 minute
    
    const formattedExpiryDate = resetTokenExpiry.toISOString(); // Format UTC
    
    await pool.query(
      'UPDATE utilisateurs SET reset_token = $1, reset_token_expiration = $2 WHERE email = $3',
      [resetTokenHash, formattedExpiryDate, email]
    );

    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
    const mailOptions = {
      from: 'votre-email@gmail.com',
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe',
      text: `Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le lien suivant pour le réinitialiser : ${resetUrl}`
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error('Erreur lors de l\'envoi de l\'email:', error);
        return res.status(500).json({ message: 'Erreur lors de l\'envoi de l\'email' });
      }
      res.json({ message: 'Email de réinitialisation envoyé' });
    });
  } catch (error) {
    console.error('Erreur lors de la demande de réinitialisation:', error);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});


app.post('/api/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  try {
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
    console.log("Token haché:", resetTokenHash);

    const currentDate = new Date().toISOString();
    console.log("Date actuelle (UTC):", currentDate);

    const { rows } = await pool.query(
      'SELECT * FROM utilisateurs WHERE reset_token = $1 AND reset_token_expiration > $2',
      [resetTokenHash, currentDate]
    );

    if (rows.length === 0) {
      console.log("Aucun utilisateur trouvé ou token expiré.");
      return res.status(400).json({ message: 'Token invalide ou expiré' });
    }

    const user = rows[0];
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      'UPDATE utilisateurs SET mot_de_passe = $1, reset_token = NULL, reset_token_expiration = NULL WHERE id = $2',
      [hashedPassword, user.id]
    );

    res.json({ message: 'Mot de passe réinitialisé avec succès' });
  } catch (error) {
    console.error('Erreur lors de la réinitialisation du mot de passe:', error);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});


// Route pour vérifier la validité du token
app.get('/api/reset-password/:token/validate', async (req, res) => {
  const { token } = req.params;
  const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const currentDate = new Date().toISOString(); // Capturez la date actuelle en UTC

  try {
    console.log(`Token Hash: ${resetTokenHash}`);
    console.log(`Current Date (UTC): ${currentDate}`);

    const { rows } = await pool.query(
      'SELECT * FROM utilisateurs WHERE reset_token = $1 AND reset_token_expiration > $2',
      [resetTokenHash, currentDate] // Compare en UTC
    );

    console.log(`Rows Returned: ${rows.length}`);

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Token invalide ou expiré' });
    }

    res.status(200).json({ message: 'Token valide' });
  } catch (error) {
    console.error('Erreur lors de la vérification du token:', error);
    res.status(500).json({ message: 'Erreur de serveur' });
  }
});


app.listen(5000, () => {
  console.log('Serveur démarré sur le port 5000');
});
