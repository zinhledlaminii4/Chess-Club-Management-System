const express = require('express');
const path = require('path');
const session = require('express-session');
const bcrypt = require('bcrypt');

const db = require('./db');

console.log("RUNNING THE CHESS-CLUB SERVER FILE");

const app = express();

const PORT = 3000;

app.use(express.json());

app.use(session({
    name: 'chessclub.sid',
    secret: process.env.SESSION_SECRET || 'chess-club-local-development-secret-change-before-deployment',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60
    }
}));

app.use(express.static(path.join(__dirname, '../PUBLIC')));

function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            message: 'Please log in to access this feature.'
        });
    }

    next();
}

function requireRole(...allowedRoles) {
    return function (req, res, next) {
        if (!req.session || !req.session.user) {
            return res.status(401).json({
                message: 'Please log in first.'
            });
        }

        const activeRole = req.session.user.activeRole;

        if (!activeRole || !allowedRoles.includes(activeRole.ROLE_NAME)) {
            return res.status(403).json({
                message: 'You do not have permission to perform this action.'
            });
        }

        next();
    };
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../PUBLIC/index.html'));
});

app.get('/api/players', requireLogin, async (req, res) => {
    const role = req.session.user.activeRole;
    const user = req.session.user;

    if (!role || !['COACH', 'IT_ADMIN'].includes(role.ROLE_NAME)) {
        return res.status(403).json({
            error: 'You are not authorized to view player records.'
        });
    }

    try {
        let sql = `
            SELECT
                pl.PLAYER_ID, pl.PERSON_ID,
                p.USERNAME, p.FIRST_NAME, p.LAST_NAME,
                p.DOB, p.GENDER, p.PHONE,
                pl.EMAIL, pl.RATING, pl.CCID,
                cc.CC_NAME
            FROM PLAYERS pl
            INNER JOIN PERSONS p ON pl.PERSON_ID = p.PERSON_ID
            INNER JOIN CHESS_CLUBS cc ON pl.CCID = cc.CCID
        `;
        const params = [];

        if (role.ROLE_NAME === 'COACH') {
            if (!role.CCID) {
                return res.status(403).json({
                    error: 'Your coach account has no assigned club.'
                });
            }
            sql += ' WHERE pl.CCID = ?';
            params.push(role.CCID);
        }

        sql += ' ORDER BY p.LAST_NAME, p.FIRST_NAME';

        const [rows] = await db.promise().query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error('Error retrieving players:', error);
        res.status(500).json({
            error: 'Failed to retrieve players.'
        });
    }
});

app.get('/api/coaches', requireLogin, async (req, res) => {
    const role = req.session.user.activeRole;

    if (!role || !['COACH', 'IT_ADMIN'].includes(role.ROLE_NAME)) {
        return res.status(403).json({
            error: 'You are not authorized to view coach records.'
        });
    }

    try {
        let sql = `
            SELECT
                c.COACH_ID, c.PERSON_ID,
                p.USERNAME, p.FIRST_NAME, p.LAST_NAME,
                p.DOB, p.GENDER, p.PHONE,
                c.CCID, cc.CC_NAME
            FROM COACHES c
            INNER JOIN PERSONS p ON c.PERSON_ID = p.PERSON_ID
            INNER JOIN CHESS_CLUBS cc ON c.CCID = cc.CCID
        `;
        const params = [];

        if (role.ROLE_NAME === 'COACH') {
            if (!role.CCID) {
                return res.status(403).json({
                    error: 'Your coach account has no assigned club.'
                });
            }
            sql += ' WHERE c.CCID = ?';
            params.push(role.CCID);
        }

        sql += ' ORDER BY p.LAST_NAME, p.FIRST_NAME';

        const [rows] = await db.promise().query(sql, params);
        res.json(rows);
    } catch (error) {
        console.error('Error retrieving coaches:', error);
        res.status(500).json({
            error: 'Failed to retrieve coaches.'
        });
    }
});

app.get('/api/classes', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT
                CLASSES.CLASS_ID,
                CLASSES.COACH_ID,
                CLASSES.LESSON_TITLE,
                CLASSES.LESSON_DESCRIPTION,
                CLASSES.CLASS_LEVEL,
                PERSONS.FIRST_NAME,
                PERSONS.LAST_NAME
            FROM CLASSES
            INNER JOIN COACHES
                ON CLASSES.COACH_ID = COACHES.COACH_ID
            INNER JOIN PERSONS
                ON COACHES.PERSON_ID = PERSONS.PERSON_ID
        `);

        res.json(rows);

    } catch (error) {
        console.error('Error retrieving classes:', error);

        res.status(500).json({
            error: 'Failed to retrieve classes'
        });
    }
});

app.get('/api/class-participants', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT
                CLASS_PARTICIPANTS.CLASS_PARTICIPANTS_ID,
                CLASSES.CLASS_ID,
                CLASSES.LESSON_TITLE,
                PLAYERS.PLAYER_ID,
                PERSONS.FIRST_NAME,
                PERSONS.LAST_NAME
            FROM CLASS_PARTICIPANTS

            INNER JOIN CLASSES
                ON CLASS_PARTICIPANTS.CLASS_ID = CLASSES.CLASS_ID

            INNER JOIN PLAYERS
                ON CLASS_PARTICIPANTS.PLAYER_ID = PLAYERS.PLAYER_ID

            INNER JOIN PERSONS
                ON PLAYERS.PERSON_ID = PERSONS.PERSON_ID
        `);

        res.json(rows);

    } catch (error) {
        console.error('Error retrieving class participants:', error);

        res.status(500).json({
            error: 'Failed to retrieve class participants'
        });
    }
});

app.get('/api/tournaments', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT
                TOURNAMENTS.TOURNAMENT_ID,
                TOURNAMENTS.TOURNAMENT_NAME,
                TOURNAMENTS.TOURNAMENT_DATE,
                TOURNAMENTS.LOCATION_ID,
                TOURNAMENTS.AGE_GROUP_ID,
                LOCATIONS.STREET_ADDRESS,
                LOCATIONS.TOWN_NAME,
                LOCATIONS.POSTAL_CODE,
                AGE_GROUPS.CATEGORY_NAME,
                PERSONS.FIRST_NAME,
                PERSONS.LAST_NAME,
                TOURNAMENTS.TOURNAMENT_DESCRIPTION,
                TOURNAMENTS.TOURNAMENT_ENTRY_FEE
            FROM TOURNAMENTS
            LEFT JOIN LOCATIONS
                ON TOURNAMENTS.LOCATION_ID = LOCATIONS.LOCATION_ID
            LEFT JOIN AGE_GROUPS
                ON TOURNAMENTS.AGE_GROUP_ID = AGE_GROUPS.AGE_GROUP_ID
            LEFT JOIN ORGANISERS
                ON TOURNAMENTS.ORGANISERID = ORGANISERS.ORGANISER_ID
            LEFT JOIN PERSONS
                ON ORGANISERS.PERSON_ID = PERSONS.PERSON_ID
            ORDER BY TOURNAMENTS.TOURNAMENT_DATE
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error retrieving tournaments:', error);
        res.status(500).json({
            error: 'Failed to retrieve tournaments'
        });
    }
});
app.post('/api/tournaments', requireLogin, requireRole('ORGANISER'), async (req, res) => {
    const { tournamentName, tournamentDate, locationId, ageGroupId,
        description, entryFee } = req.body;
    const organiserId = Number(req.session.user.activeRole.ROLE_ID);
    console.log('Editing tournament ID:', tournamentId);
console.log('Logged-in organiser ID:', organiserId);

    if (!tournamentName?.trim() || !tournamentDate) {
        return res.status(400).json({
            error: 'Tournament name and date are required.'
        });
    }

    try {
        const [result] = await db.promise().query(`
            INSERT INTO TOURNAMENTS
                (TOURNAMENT_NAME, TOURNAMENT_DATE, LOCATION_ID,
                 AGE_GROUP_ID, ORGANISERID, TOURNAMENT_DESCRIPTION,
                 TOURNAMENT_ENTRY_FEE)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            tournamentName.trim(), tournamentDate,
            locationId || null, ageGroupId || null, organiserId,
            description || null,
            entryFee === '' || entryFee == null ? null : Number(entryFee)
        ]);

        res.status(201).json({
            message: 'Tournament created successfully.',
            tournamentId: result.insertId
        });
    } catch (error) {
        console.error('Create tournament error:', error);
        res.status(500).json({ error: 'Could not create tournament.' });
    }
});

app.put('/api/tournaments/:id', requireLogin, requireRole('ORGANISER'), async (req, res) => {
    const tournamentId = Number(req.params.id);
    const organiserId = Number(req.session.user.activeRole.ROLE_ID);
    const { tournamentName, tournamentDate, locationId, ageGroupId,
        description, entryFee } = req.body;

    if (!Number.isInteger(tournamentId) || tournamentId < 1 ||
        !tournamentName?.trim() || !tournamentDate) {
        return res.status(400).json({ error: 'Valid tournament details are required.' });
    }

    try {
        const [result] = await db.promise().query(`
            UPDATE TOURNAMENTS
            SET TOURNAMENT_NAME = ?, TOURNAMENT_DATE = ?,
                LOCATION_ID = ?, AGE_GROUP_ID = ?,
                TOURNAMENT_DESCRIPTION = ?, TOURNAMENT_ENTRY_FEE = ?
            WHERE TOURNAMENT_ID = ? AND ORGANISERID = ?
        `, [
            tournamentName.trim(), tournamentDate,
            locationId || null, ageGroupId || null,
            description || null,
            entryFee === '' || entryFee == null ? null : Number(entryFee),
            tournamentId, organiserId
        ]);

        if (!result.affectedRows) {
            return res.status(404).json({
                error: 'Tournament not found or you do not manage it.'
            });
        }

        res.json({ message: 'Tournament updated successfully.' });
    } catch (error) {
        console.error('Update tournament error:', error);
        res.status(500).json({ error: 'Could not update tournament.' });
    }
});

app.delete('/api/tournaments/:id', requireLogin, requireRole('ORGANISER'), async (req, res) => {
    const tournamentId = Number(req.params.id);
    const organiserId = Number(req.session.user.activeRole.ROLE_ID);

    if (!Number.isInteger(tournamentId) || tournamentId < 1) {
        return res.status(400).json({ error: 'Invalid tournament ID.' });
    }

    try {
        const [result] = await db.promise().query(`
            DELETE FROM TOURNAMENTS
            WHERE TOURNAMENT_ID = ? AND ORGANISERID = ?
        `, [tournamentId, organiserId]);

        if (!result.affectedRows) {
            return res.status(404).json({
                error: 'Tournament not found or you do not manage it.'
            });
        }

        res.json({ message: 'Tournament deleted successfully.' });
    } catch (error) {
        console.error('Delete tournament error:', error);
        res.status(409).json({
            error: 'Could not delete tournament. Related records may depend on it.'
        });
    }
});

app.get('/api/tournament-rsvps', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT
                TOURNAMENT_RSVPS.RSVP_ID,
                TOURNAMENTS.TOURNAMENT_NAME,
                TOURNAMENTS.TOURNAMENT_DATE,
                PLAYERS.PLAYER_ID,
                PERSONS.FIRST_NAME,
                PERSONS.LAST_NAME,
                TOURNAMENT_RSVPS.ATTENDANCE_STATUS
            FROM TOURNAMENT_RSVPS
            INNER JOIN TOURNAMENTS
                ON TOURNAMENT_RSVPS.TOURNAMENT_ID =
                   TOURNAMENTS.TOURNAMENT_ID
            INNER JOIN PLAYERS
                ON TOURNAMENT_RSVPS.PLAYER_ID =
                   PLAYERS.PLAYER_ID
            INNER JOIN PERSONS
                ON PLAYERS.PERSON_ID = PERSONS.PERSON_ID
            ORDER BY TOURNAMENTS.TOURNAMENT_DATE
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error retrieving tournament RSVPs:', error);
        res.status(500).json({
            error: 'Failed to retrieve tournament RSVPs'
        });
    }
});

app.get('/api/test-rsvp', (req, res) => {
    res.send('RSVP test route works!');
});

app.get('/api/club-tournament-entries', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT
                CLUB_TOURNAMENT_ENTRIES.ENTRY_ID,
                CHESS_CLUBS.CC_NAME,
                TOURNAMENTS.TOURNAMENT_NAME,
                PERSONS.FIRST_NAME,
                PERSONS.LAST_NAME,
                CLUB_TOURNAMENT_ENTRIES.ENTRY_DATE,
                CLUB_TOURNAMENT_ENTRIES.STATUS,
                CLUB_TOURNAMENT_ENTRIES.DECISION_DATE
            FROM CLUB_TOURNAMENT_ENTRIES
            LEFT JOIN CHESS_CLUBS
                ON CLUB_TOURNAMENT_ENTRIES.CLUB_ID = CHESS_CLUBS.CCID
            LEFT JOIN TOURNAMENTS
                ON CLUB_TOURNAMENT_ENTRIES.TOURNAMENT_ID =
                   TOURNAMENTS.TOURNAMENT_ID
            LEFT JOIN PERSONS
                ON CLUB_TOURNAMENT_ENTRIES.REGISTERED_BY =
                   PERSONS.PERSON_ID
            ORDER BY CLUB_TOURNAMENT_ENTRIES.ENTRY_DATE DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error retrieving club tournament entries:', error);
        res.status(500).json({
            error: 'Failed to retrieve club tournament entries'
        });
    }
});

app.post('/api/club-tournament-entries', requireLogin, requireRole('COACH'), async (req, res) => {
    try {
        const user = req.session.user;
        const clubId = Number(user.activeRole?.CCID);
        const tournamentId = Number(req.body.tournamentId);
        const personId = Number(user.personId);

        if (!clubId || !tournamentId || !personId) {
            return res.status(400).json({
                error: 'Coach, club, and tournament information are required.'
            });
        }

        const [tournaments] = await db.promise().query(
            'SELECT TOURNAMENT_ID FROM TOURNAMENTS WHERE TOURNAMENT_ID = ?',
            [tournamentId]
        );

        if (tournaments.length === 0) {
            return res.status(404).json({
                error: 'The selected tournament was not found.'
            });
        }

        const [existing] = await db.promise().query(
            `SELECT ENTRY_ID
             FROM CLUB_TOURNAMENT_ENTRIES
             WHERE CLUB_ID = ? AND TOURNAMENT_ID = ?`,
            [clubId, tournamentId]
        );

        if (existing.length > 0) {
            return res.status(409).json({
                error: 'Your club has already submitted an entry for this tournament.'
            });
        }

        await db.promise().query(
            `INSERT INTO CLUB_TOURNAMENT_ENTRIES
                (CLUB_ID, TOURNAMENT_ID, REGISTERED_BY, ENTRY_DATE, STATUS, DECISION_DATE)
             VALUES (?, ?, ?, CURDATE(), 'Pending', NULL)`,
            [clubId, tournamentId, personId]
        );

        res.status(201).json({
            message: 'Club tournament entry submitted successfully!'
        });
    } catch (error) {
    console.error('Club tournament entry error:', error);

    res.status(500).json({
        error: error.message
    });
}});

app.get(
    '/api/organiser/club-tournament-entries',
    requireLogin,
    requireRole('ORGANISER'),
    async (req, res) => {
        try {
            const [entries] = await db.promise().query(`
                SELECT
                    e.ENTRY_ID,
                    e.TOURNAMENT_ID,
                    e.STATUS,
                    e.ENTRY_DATE,
                    e.DECISION_DATE,
                    c.CC_NAME AS CLUB_NAME,
                    t.TOURNAMENT_NAME
                FROM CLUB_TOURNAMENT_ENTRIES e
                JOIN CHESS_CLUBS c ON c.CCID = e.CLUB_ID
                JOIN TOURNAMENTS t
                    ON t.TOURNAMENT_ID = e.TOURNAMENT_ID
                ORDER BY e.ENTRY_DATE DESC
            `);

            res.json(entries);
        } catch (error) {
            console.error('Could not load club entries:', error);
            res.status(500).json({ error: 'Could not load club entries.' });
        }
    }
);

app.put(
    '/api/organiser/club-tournament-entries/:id/decision',
    requireLogin,
    requireRole('ORGANISER'),
    async (req, res) => {
        const { status } = req.body;
        const entryId = Number(req.params.id);

        if (!Number.isInteger(entryId) || entryId < 1 ||
            !['Approved', 'Rejected'].includes(status)) {
            return res.status(400).json({
                error: 'Choose Approved or Rejected.'
            });
        }

        try {
            const [result] = await db.promise().query(`
                UPDATE CLUB_TOURNAMENT_ENTRIES
                SET STATUS = ?, DECISION_DATE = NOW()
                WHERE ENTRY_ID = ? AND STATUS = 'Pending'
            `, [status, entryId]);

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    error: 'Entry not found or it has already been decided.'
                });
            }

            res.json({ message: `Club entry ${status.toLowerCase()} successfully.` });
        } catch (error) {
            console.error('Could not decide club entry:', error);
            res.status(500).json({ error: 'Could not update the entry.' });
        }
    }
);

app.get('/api/coach-player-assignments', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT
                COACH_PLAYER_ASSIGNMENTS.ASSIGNMENT_ID,
                COACHES.COACH_ID,
                CONCAT(
                    COACH_PERSON.FIRST_NAME, ' ',
                    COACH_PERSON.LAST_NAME
                ) AS COACH_NAME,
                PLAYERS.PLAYER_ID,
                CONCAT(
                    PLAYER_PERSON.FIRST_NAME, ' ',
                    PLAYER_PERSON.LAST_NAME
                ) AS PLAYER_NAME,
                COACH_PLAYER_ASSIGNMENTS.REGISTRATION_DATE,
                COACH_PLAYER_ASSIGNMENTS.STATUS
            FROM COACH_PLAYER_ASSIGNMENTS
            LEFT JOIN COACHES
                ON COACH_PLAYER_ASSIGNMENTS.COACH_ID =
                   COACHES.COACH_ID
            LEFT JOIN PERSONS AS COACH_PERSON
                ON COACHES.PERSON_ID = COACH_PERSON.PERSON_ID
            LEFT JOIN PLAYERS
                ON COACH_PLAYER_ASSIGNMENTS.PLAYER_ID =
                   PLAYERS.PLAYER_ID
            LEFT JOIN PERSONS AS PLAYER_PERSON
                ON PLAYERS.PERSON_ID = PLAYER_PERSON.PERSON_ID
            ORDER BY COACH_PLAYER_ASSIGNMENTS.REGISTRATION_DATE DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error retrieving coach-player assignments:', error);
        res.status(500).json({
            error: 'Failed to retrieve coach-player assignments'
        });
    }
});

app.get('/api/announcements', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT
                a.ANNOUNCEMENT_ID,
                a.ADMIN_ID,
                a.ANNOUNCEMENT_TYPE,
                a.ANNOUNCEMENT_DATE,
                a.ANNOUNCEMENT_POSTER,
                a.ANNOUNCEMENT_DESCRIPTION,
                p.FIRST_NAME,
                p.LAST_NAME
            FROM AOB_ANNOUNCEMENTS a
            LEFT JOIN IT_ADMINS ia
                ON ia.ADMIN_ID = a.ADMIN_ID
            LEFT JOIN PERSONS p
                ON p.PERSON_ID = ia.PERSON_ID
            ORDER BY
                a.ANNOUNCEMENT_DATE DESC,
                a.ANNOUNCEMENT_ID DESC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error loading announcements:', error);
        res.status(500).json({
            error: 'Failed to load announcements.'
        });
    }
});

app.post('/api/announcements', requireLogin, requireRole('IT_ADMIN'), async (req, res) => {
    const { announcementType, announcementDate, poster, description } = req.body;
    const adminId = Number(req.session.user.activeRole.ROLE_ID);

    if (!announcementType?.trim() || !announcementDate ||
        !description?.trim()) {
        return res.status(400).json({
            error: 'Announcement type, date and description are required.'
        });
    }

    try {
        const [result] = await db.promise().query(`
            INSERT INTO AOB_ANNOUNCEMENTS
                (ADMIN_ID, ANNOUNCEMENT_TYPE, ANNOUNCEMENT_DATE,
                 ANNOUNCEMENT_POSTER, ANNOUNCEMENT_DESCRIPTION)
            VALUES (?, ?, ?, ?, ?)
        `, [
            adminId, announcementType.trim(), announcementDate,
            poster || null, description.trim()
        ]);

        res.status(201).json({
            message: 'Announcement created successfully.',
            announcementId: result.insertId
        });
    } catch (error) {
        console.error('Create announcement error:', error);
        res.status(500).json({ error: 'Could not create announcement.' });
    }
});

app.put('/api/announcements/:id', requireLogin, requireRole('IT_ADMIN'), async (req, res) => {
    const announcementId = Number(req.params.id);
    const { announcementType, announcementDate, poster, description } = req.body;

    if (!Number.isInteger(announcementId) || announcementId < 1 ||
        !announcementType?.trim() || !announcementDate ||
        !description?.trim()) {
        return res.status(400).json({
            error: 'Valid announcement details are required.'
        });
    }

    try {
        const [result] = await db.promise().query(`
            UPDATE AOB_ANNOUNCEMENTS
            SET ANNOUNCEMENT_TYPE = ?, ANNOUNCEMENT_DATE = ?,
                ANNOUNCEMENT_POSTER = ?, ANNOUNCEMENT_DESCRIPTION = ?
            WHERE ANNOUNCEMENT_ID = ?
        `, [
            announcementType.trim(), announcementDate,
            poster || null, description.trim(), announcementId
        ]);

        if (!result.affectedRows) {
            const [rows] = await db.promise().query(
                'SELECT ANNOUNCEMENT_ID FROM AOB_ANNOUNCEMENTS WHERE ANNOUNCEMENT_ID = ?',
                [announcementId]
            );
            if (!rows.length) {
                return res.status(404).json({ error: 'Announcement not found.' });
            }
        }

        res.json({ message: 'Announcement updated successfully.' });
    } catch (error) {
        console.error('Update announcement error:', error);
        res.status(500).json({ error: 'Could not update announcement.' });
    }
});

app.delete('/api/announcements/:id', requireLogin, requireRole('IT_ADMIN'), async (req, res) => {
    const announcementId = Number(req.params.id);

    if (!Number.isInteger(announcementId) || announcementId < 1) {
        return res.status(400).json({ error: 'Invalid announcement ID.' });
    }

    try {
        const [result] = await db.promise().query(
            'DELETE FROM AOB_ANNOUNCEMENTS WHERE ANNOUNCEMENT_ID = ?',
            [announcementId]
        );

        if (!result.affectedRows) {
            return res.status(404).json({ error: 'Announcement not found.' });
        }

        res.json({ message: 'Announcement deleted successfully.' });
    } catch (error) {
        console.error('Delete announcement error:', error);
        res.status(409).json({
            error: 'Could not delete announcement.'
        });
    }
});

app.post('/api/players', requireLogin, requireRole('COACH'), async (req, res) => {
    const {
        username, firstName, lastName, dob, gender, phone,
        email, rating, ccid, password
    } = req.body;

    if (
        !username?.trim() ||
        !firstName?.trim() ||
        !lastName?.trim() ||
        !email?.trim() ||
        typeof password !== 'string' ||
        password.length < 8 ||
        !Number.isInteger(Number(ccid))
    ) {
        return res.status(400).json({
            error: 'Complete all required fields. Passwords must contain at least 8 characters.'
        });
    }

    const coachClubId = Number(req.session.user.activeRole?.CCID);

    if (!coachClubId || Number(ccid) !== coachClubId) {
        return res.status(403).json({
            error: 'You can only register players for your own chess club.'
        });
    }

    let connection;

    try {
        connection = await db.promise().getConnection();
        await connection.beginTransaction();

        const [existing] = await connection.query(
            'SELECT PERSON_ID FROM PERSONS WHERE USERNAME = ?',
            [username.trim()]
        );

        if (existing.length > 0) {
            await connection.rollback();
            return res.status(409).json({
                error: 'That username is already in use.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [personResult] = await connection.query(`
            INSERT INTO PERSONS
                (USERNAME, FIRST_NAME, LAST_NAME, DOB, GENDER, PHONE)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            username.trim(),
            firstName.trim(),
            lastName.trim(),
            dob || null,
            gender || null,
            phone || null
        ]);

        const personId = personResult.insertId;

        await connection.query(`
            INSERT INTO USER_ACCOUNTS
                (PERSON_ID, PASSWORD_HASH, ACCOUNT_STATUS)
            VALUES (?, ?, 'ACTIVE')
        `, [personId, passwordHash]);

        await connection.query(`
            INSERT INTO PLAYERS (PERSON_ID, CCID, EMAIL, RATING)
            VALUES (?, ?, ?, ?)
        `, [
            personId,
            coachClubId,
            email.trim(),
            rating === '' || rating == null ? null : Number(rating)
        ]);

        await connection.commit();

        return res.status(201).json({
            message: 'Player registered successfully. They can now log in.'
        });

    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }

        console.error('Error registering player:', error);

        return res.status(500).json({
            error: 'Could not register the player. Check the details and try again.'
        });

    } finally {
        if (connection) connection.release();
    }
});

app.put('/api/players/:id', requireLogin, requireRole('COACH'), async (req, res) => {
    const playerId = Number(req.params.id);
    const {
        username, firstName, lastName, dob, gender, phone,
        email, rating, ccid
    } = req.body;

    if (!Number.isInteger(playerId) || playerId < 1 ||
        !username?.trim() || !firstName?.trim() ||
        !lastName?.trim() || !email?.trim() ||
        !Number.isInteger(Number(ccid))) {
        return res.status(400).json({ error: 'Please provide valid player details.' });
    }

    const connection = await db.promise().getConnection();

    try {
        await connection.beginTransaction();

        const [found] = await connection.query(`
          SELECT PERSON_ID, CCID
          FROM PLAYERS
          WHERE PLAYER_ID = ?
         `, [playerId]);

        if (found.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Player not found.' });
        }

        const coachClubId = Number(req.session.user.activeRole?.CCID);

       if (
          !coachClubId ||
          Number(found[0].CCID) !== coachClubId ||
          Number(ccid) !== coachClubId
     ) {
           await connection.rollback();
           return res.status(403).json({
          error: 'You can only edit players in your own chess club.'
         });
       }

        const personId = found[0].PERSON_ID;

        await connection.query(`
            UPDATE PERSONS
            SET USERNAME = ?, FIRST_NAME = ?, LAST_NAME = ?,
                DOB = ?, GENDER = ?, PHONE = ?
            WHERE PERSON_ID = ?
        `, [
            username.trim(), firstName.trim(), lastName.trim(),
            dob || null, gender || null, phone || null, personId
        ]);

        const [result] = await connection.query(`
            UPDATE PLAYERS
            SET CCID = ?, EMAIL = ?, RATING = ?
            WHERE PLAYER_ID = ?
        `, [
            Number(ccid), email.trim(),
            rating === '' || rating == null ? null : Number(rating),
            playerId
        ]);

        await connection.commit();
        res.json({ message: 'Player updated successfully.' });
    } catch (error) {
        await connection.rollback();
        console.error('Error updating player:', error);
        res.status(400).json({
            error: 'Could not update player. Check the username, club and entered details.'
        });
    } finally {
        connection.release();
    }
});

app.delete('/api/players/:id', requireLogin, requireRole('COACH'), async (req, res) => {
    const playerId = Number(req.params.id);
    const coachClubId = Number(req.session.user.activeRole?.CCID);

    if (!Number.isInteger(playerId) || playerId < 1) {
        return res.status(400).json({ error: 'Invalid player ID.' });
    }

    if (!coachClubId) {
        return res.status(403).json({ error: 'Your coach club is not assigned.' });
    }

    let connection;

    try {
        connection = await db.promise().getConnection();
        await connection.beginTransaction();

        const [found] = await connection.query(
            'SELECT PERSON_ID, CCID FROM PLAYERS WHERE PLAYER_ID = ?',
            [playerId]
        );

        if (found.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Player not found.' });
        }

        if (Number(found[0].CCID) !== coachClubId) {
            await connection.rollback();
            return res.status(403).json({
                error: 'You can only delete players in your own chess club.'
            });
        }

        const personId = found[0].PERSON_ID;

        await connection.query(
            'DELETE FROM CLASS_PARTICIPANTS WHERE PLAYER_ID = ?',
            [playerId]
        );
        await connection.query(
            'DELETE FROM TOURNAMENT_RSVPS WHERE PLAYER_ID = ?',
            [playerId]
        );
        await connection.query(
            'DELETE FROM COACH_PLAYER_ASSIGNMENTS WHERE PLAYER_ID = ?',
            [playerId]
        );
        await connection.query(
            'DELETE FROM PLAYERS WHERE PLAYER_ID = ?',
            [playerId]
        );

        const [references] = await connection.query(`
            SELECT
                (SELECT COUNT(*) FROM COACHES WHERE PERSON_ID = ?) +
                (SELECT COUNT(*) FROM ORGANISERS WHERE PERSON_ID = ?) +
                (SELECT COUNT(*) FROM IT_ADMINS WHERE PERSON_ID = ?) +
                (SELECT COUNT(*) FROM CLUB_TOURNAMENT_ENTRIES WHERE REGISTERED_BY = ?)
                AS reference_count
        `, [personId, personId, personId, personId]);

        if (Number(references[0].reference_count) === 0) {
            await connection.query(
                'DELETE FROM USER_ACCOUNTS WHERE PERSON_ID = ?',
                [personId]
            );
            await connection.query(
                'DELETE FROM PERSONS WHERE PERSON_ID = ?',
                [personId]
            );
        }

        await connection.commit();
        return res.json({ message: 'Player record deleted successfully.' });

    } catch (error) {
        if (connection) {
            await connection.rollback().catch(() => {});
        }

        console.error('Error deleting player:', error);
        return res.status(409).json({
            error: 'Could not delete this player because another database record may depend on it.'
        });
    } finally {
        if (connection) connection.release();
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    if (
        typeof username !== 'string' ||
        typeof password !== 'string' ||
        !username.trim() ||
        !password
    ) {
        return res.status(400).json({
            error: 'Username and password are required.'
        });
    }

    try {
        const [accounts] = await db.promise().query(`
            SELECT
                USER_ACCOUNTS.ACCOUNT_ID,
                USER_ACCOUNTS.PERSON_ID,
                USER_ACCOUNTS.PASSWORD_HASH,
                USER_ACCOUNTS.ACCOUNT_STATUS,
                PERSONS.USERNAME
            FROM USER_ACCOUNTS
            INNER JOIN PERSONS
                ON USER_ACCOUNTS.PERSON_ID = PERSONS.PERSON_ID
            WHERE PERSONS.USERNAME = ?
        `, [username.trim()]);

        if (accounts.length !== 1) {
            return res.status(401).json({
                error: 'Invalid username or password.'
            });
        }

        const account = accounts[0];

        if (account.ACCOUNT_STATUS !== 'ACTIVE') {
            return res.status(403).json({
                error: 'This account is not active.'
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            account.PASSWORD_HASH
        );

        if (!passwordMatches) {
            return res.status(401).json({
                error: 'Invalid username or password.'
            });
        }

        const [roles] = await db.promise().query(`
            SELECT 'PLAYER' AS ROLE_NAME, PLAYER_ID AS ROLE_ID, CCID
            FROM PLAYERS
            WHERE PERSON_ID = ?

            UNION ALL

            SELECT 'COACH' AS ROLE_NAME, COACH_ID AS ROLE_ID, CCID
            FROM COACHES
            WHERE PERSON_ID = ?

            UNION ALL

            SELECT 'ORGANISER' AS ROLE_NAME,
                   ORGANISER_ID AS ROLE_ID,
                   NULL AS CCID
            FROM ORGANISERS
            WHERE PERSON_ID = ?

            UNION ALL

            SELECT 'IT_ADMIN' AS ROLE_NAME,
                   ADMIN_ID AS ROLE_ID,
                   CCID
            FROM IT_ADMINS
            WHERE PERSON_ID = ?
        `, [
            account.PERSON_ID,
            account.PERSON_ID,
            account.PERSON_ID,
            account.PERSON_ID
        ]);

        if (roles.length === 0) {
            return res.status(403).json({
                error: 'No application role is assigned to this account.'
            });
        }

        req.session.regenerate((sessionError) => {
            if (sessionError) {
                console.error('Session error:', sessionError);
                return res.status(500).json({
                    error: 'Could not start your session.'
                });
            }

          req.session.user = {
              accountId: account.ACCOUNT_ID,
              personId: account.PERSON_ID,
              username: account.USERNAME,
              roles: roles,
              activeRole: roles.length === 1 ? roles[0] : null
            };

            req.session.save((saveError) => {
                if (saveError) {
                    console.error('Session save error:', saveError);
                    return res.status(500).json({
                        error: 'Could not save your session.'
                    });
                }

                return res.json({
                    message: 'Login successful.',
                    user: {
                        personId: account.PERSON_ID,
                        username: account.USERNAME,
                        roles: roles
                    }
                });
            });
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed because of a server error.'
        });
    }
});

app.post('/api/auth/select-role', requireLogin, (req, res) => {
    const { roleName, roleId } = req.body;

    if (
        typeof roleName !== 'string' ||
        !Number.isInteger(Number(roleId))
    ) {
        return res.status(400).json({
            error: 'Please select a valid role.'
        });
    }

    const selectedRole = req.session.user.roles.find(role =>
        role.ROLE_NAME === roleName &&
        Number(role.ROLE_ID) === Number(roleId)
    );

    if (!selectedRole) {
        return res.status(403).json({
            error: 'That role is not assigned to your account.'
        });
    }

    req.session.user.activeRole = selectedRole;

    req.session.save(error => {
        if (error) {
            console.error('Role selection session error:', error);

            return res.status(500).json({
                error: 'Could not save your selected role.'
            });
        }

        res.json({
            message: 'Role selected successfully.',
            activeRole: selectedRole
        });
    });
});

app.get('/api/auth/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({
            error: 'You are not logged in.'
        });
    }

    res.json({
        user: req.session.user,
        activeRole: req.session.user.activeRole || null
    });
});

app.post('/api/auth/logout', (req, res) => {
    if (!req.session) {
        return res.json({ message: 'Logged out.' });
    }

    req.session.destroy((error) => {
        if (error) {
            console.error('Logout error:', error);
            return res.status(500).json({
                error: 'Could not log out.'
            });
        }

        res.clearCookie('chessclub.sid');
        res.json({ message: 'Logged out successfully.' });
    });
});

app.get('/api/profile', requireLogin, async (req, res) => {
    const user = req.session.user;
    const role = user.activeRole;

    try {
        const [people] = await db.promise().query(`
            SELECT
                PERSON_ID,
                USERNAME,
                FIRST_NAME,
                LAST_NAME,
                DOB,
                GENDER,
                PHONE
            FROM PERSONS
            WHERE PERSON_ID = ?
        `, [user.personId]);

        if (!people.length) {
            return res.status(404).json({
                error: 'Profile not found.'
            });
        }

        let roleDetails = {};

        if (role) {
            const roleQueries = {
                PLAYER: {
                    sql: `SELECT PLAYER_ID, CCID, EMAIL, RATING
                          FROM PLAYERS WHERE PLAYER_ID = ?
                          AND PERSON_ID = ?`,
                    params: [role.ROLE_ID, user.personId]
                },
                COACH: {
                    sql: `SELECT COACH_ID, CCID
                          FROM COACHES WHERE COACH_ID = ?
                          AND PERSON_ID = ?`,
                    params: [role.ROLE_ID, user.personId]
                },
                ORGANISER: {
                    sql: `SELECT ORGANISER_ID
                          FROM ORGANISERS WHERE ORGANISER_ID = ?
                          AND PERSON_ID = ?`,
                    params: [role.ROLE_ID, user.personId]
                },
                IT_ADMIN: {
                    sql: `SELECT ADMIN_ID, CCID
                          FROM IT_ADMINS WHERE ADMIN_ID = ?
                          AND PERSON_ID = ?`,
                    params: [role.ROLE_ID, user.personId]
                }
            };

            const selected = roleQueries[role.ROLE_NAME];

            if (!selected) {
                return res.status(400).json({
                    error: 'Please select a valid role.'
                });
            }

            const [details] = await db.promise().query(
                selected.sql,
                selected.params
            );

            if (!details.length) {
                return res.status(403).json({
                    error: 'The selected role could not be verified.'
                });
            }

            roleDetails = details[0];
        }

        res.json({
            profile: people[0],
            activeRole: role,
            roleDetails
        });
    } catch (error) {
        console.error('Profile retrieval error:', error);
        res.status(500).json({
            error: 'Could not retrieve your profile.'
        });
    }
});

app.get(
    '/api/organiser/tournament-options',
    requireLogin,
    requireRole('ORGANISER'),
    async (req, res) => {
        try {
            const [locations] = await db.promise().query(`
                SELECT LOCATION_ID, TOWN_NAME
                FROM LOCATIONS
                ORDER BY TOWN_NAME
            `);

            const [ageGroups] = await db.promise().query(`
                SELECT
                    AGE_GROUP_ID,
                    CATEGORY_NAME AS AGE_GROUP_NAME
                FROM AGE_GROUPS
                ORDER BY CATEGORY_NAME
            `);

            const affiliations = [];
            res.json({
                locations,
                ageGroups,
                affiliations
            });
        } catch (error) {
            console.error('Tournament options error:', error);

            res.status(500).json({
                error: 'Could not load tournament options.'
            });
        }
    }
);

app.post(
    '/api/organiser/tournaments',
    requireLogin,
    requireRole('ORGANISER'),
    async (req, res) => {
        const {
            tournamentName, tournamentDate, locationId,
            ageGroupId, description, affiliationId, entryFee
        } = req.body;

        if (
            !tournamentName?.trim() ||
            !tournamentDate ||
            !Number(locationId) ||
            !Number(ageGroupId) ||
            entryFee === '' ||
            entryFee == null ||
            !Number.isFinite(Number(entryFee)) ||
            Number(entryFee) < 0
        ) {
            return res.status(400).json({
                error: 'Complete the required fields and enter a valid entry fee.'
            });
        }

        const organiserId = Number(
            req.session.user.activeRole?.ROLE_ID
        );

        if (!organiserId) {
            return res.status(403).json({
                error: 'Your Organiser account could not be verified.'
            });
        }

        try {
            const [result] = await db.promise().query(`
               INSERT INTO TOURNAMENTS (
    TOURNAMENT_NAME, TOURNAMENT_DATE, LOCATION_ID,
    AGE_GROUP_ID, ORGANISERID, TOURNAMENT_DESCRIPTION,
    TOURNAMENT_ENTRY_FEE
)
VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                tournamentName.trim(),
                tournamentDate,
                Number(locationId),
                Number(ageGroupId),
                organiserId,
                description?.trim() || null,
                affiliationId ? Number(affiliationId) : null,
                Number(entryFee)
            ]);

            res.status(201).json({
                message: 'Tournament created successfully.',
                tournamentId: result.insertId
            });
        } catch (error) {
            console.error('Tournament creation error:', error);
            res.status(500).json({
                error: 'Could not create the tournament. Check the selected options.'
            });
        }
    }
);

app.get(
    '/api/matches',
    requireLogin,
    requireRole('PLAYER', 'COACH', 'ORGANISER'),
    async (req, res) => {
        try {
            const [matches] = await db.promise().query(`
                SELECT
                    M.MATCH_ID,
                    M.MATCH_DATE,
                    M.RESULT,
                    M.WHITE_PLAYER_ID,
                    WP.FIRST_NAME AS WHITE_FIRST_NAME,
                    WP.LAST_NAME AS WHITE_LAST_NAME,
                    M.BLACK_PLAYER_ID,
                    BP.FIRST_NAME AS BLACK_FIRST_NAME,
                    BP.LAST_NAME AS BLACK_LAST_NAME
                FROM MATCHES M
                INNER JOIN PLAYERS WHITE_PLAYER
                    ON M.WHITE_PLAYER_ID = WHITE_PLAYER.PLAYER_ID
                INNER JOIN PERSONS WP
                    ON WHITE_PLAYER.PERSON_ID = WP.PERSON_ID
                INNER JOIN PLAYERS BLACK_PLAYER
                    ON M.BLACK_PLAYER_ID = BLACK_PLAYER.PLAYER_ID
                INNER JOIN PERSONS BP
                    ON BLACK_PLAYER.PERSON_ID = BP.PERSON_ID
                ORDER BY M.MATCH_DATE DESC
            `);

            res.json(matches);
        } catch (error) {
            console.error('Error retrieving matches:', error);
            res.status(500).json({
                message: 'Failed to retrieve matches.'
            });
        }
    }
);

app.post(
    '/api/tournament-rsvps',
    requireLogin,
    requireRole('PLAYER'),
    async (req, res) => {
        try {
            const playerId = req.session.user.activeRole.ROLE_ID;
            const { tournamentId, attendanceStatus } = req.body;

            if (!tournamentId || !['ATTENDING', 'NOT ATTENDING'].includes(attendanceStatus)) {
                return res.status(400).json({
                    message: 'Select a tournament and attendance status.'
                });
            }

            const [tournaments] = await db.promise().query(
                'SELECT TOURNAMENT_ID FROM TOURNAMENTS WHERE TOURNAMENT_ID = ?',
                [tournamentId]
            );

            if (tournaments.length === 0) {
                return res.status(404).json({
                    message: 'Tournament not found.'
                });
            }

            
            await db.promise().query(
                `INSERT INTO TOURNAMENT_RSVPS
                    (TOURNAMENT_ID, PLAYER_ID, ATTENDANCE_STATUS)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                    ATTENDANCE_STATUS = VALUES(ATTENDANCE_STATUS)`,
                [tournamentId, playerId, attendanceStatus]
            );

            res.status(200).json({
                message: 'Your tournament RSVP has been saved successfully.'
            });
        } catch (error) {
            console.error('Error submitting tournament RSVP:', error);
            res.status(500).json({
                message: 'Could not save your RSVP.'
            });
        }
    }
);
app.get('/api/tournament-rsvps/available-tournaments', requireLogin, async (req, res) => {
    try {
        const [rows] = await db.promise().query(`
            SELECT
                TOURNAMENT_ID,
                TOURNAMENT_NAME,
                TOURNAMENT_DATE
            FROM TOURNAMENTS
            ORDER BY TOURNAMENT_DATE ASC
        `);

        res.json(rows);
    } catch (error) {
        console.error('Error loading available tournaments:', error);
        res.status(500).json({
            error: 'Failed to load tournaments.'
        });
    }
});

app.listen(PORT, () => {
    console.log(`Chess Club server running at http://localhost:${PORT}`);
});