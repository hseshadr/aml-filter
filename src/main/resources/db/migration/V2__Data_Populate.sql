INSERT INTO configuration(id, name, description)
VALUES (1, 'default', 'generic. Uses mandatory list (m)');
INSERT INTO configuration(id, name, description)
VALUES (2, 'nmConf', 'Uses non mandatory list (nm)');
INSERT INTO configuration(id, name, description)
VALUES (3, 'allConf', 'Uses the full list (pep)');

INSERT INTO configuration_entry(id, property_name, property_value)
VALUES (1, 'similarityThreshold', '0.8');
INSERT INTO configuration_entry(id, property_name, property_value)
VALUES (3, 'designation_type', 'M,N');
INSERT INTO configuration_entry(id, property_name, property_value)
VALUES (4, 'designation_type', 'M,N,P');
INSERT INTO configuration_entry(id, property_name, property_value)
VALUES (2, 'designation_type', 'M');

INSERT INTO configuration_entry_map(id_configuration_entry, id_configuration)
VALUES (1, 1);
INSERT INTO configuration_entry_map(id_configuration_entry, id_configuration)
VALUES (2, 1);
INSERT INTO configuration_entry_map(id_configuration_entry, id_configuration)
VALUES (3, 2);
INSERT INTO configuration_entry_map(id_configuration_entry, id_configuration)
VALUES (4, 3);


INSERT INTO ip_address(ip_address, blocked_status)
VALUES ('192.168.1.14', false);
INSERT INTO ip_address(ip_address, blocked_status)
VALUES ('127.0.0.1', false);
INSERT INTO ip_address(ip_address, blocked_status)
VALUES ('192.168.1.15', false);
INSERT INTO ip_address(ip_address, blocked_status)
VALUES ('192.168.1.12', false);

INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (8, '192.168.1.12');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (7, '192.168.1.12');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (6, '192.168.1.12');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (6, '192.168.1.14');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (6, '127.0.0.1');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (6, '192.168.1.15');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (7, '192.168.1.15');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (7, '192.168.1.14');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (8, '192.168.1.15');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (8, '192.168.1.14');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (8, '127.0.0.1');
INSERT INTO ip_address_process_map(id_process, ip_address)
VALUES (7, '127.0.0.1');

INSERT INTO process(id, id_configuration, enabled, company, division, description)
VALUES (7, 2, true, 'NAMERISK', 'TECH', 'M');
INSERT INTO process(id, id_configuration, enabled, company, division, description)
VALUES (6, 1, true, 'NAMERISK', 'TECH', 'MN');
INSERT INTO process(id, id_configuration, enabled, company, division, description)
VALUES (8, 3, true, 'NAMERISK', 'TECH', 'MNP');


INSERT INTO synonym(id, word, synonym)
VALUES (1, 'AUSTINE', 'AGUSTINA');
INSERT INTO synonym(id, word, synonym)
VALUES (12, 'AYASTUI', 'AYASTUY');
INSERT INTO synonym(id, word, synonym)
VALUES (15, 'BABESNE', 'AMPARO');
INSERT INTO synonym(id, word, synonym)
VALUES (16, 'BABOL', 'AMAPOLA');
INSERT INTO synonym(id, word, synonym)
VALUES (18, 'BAKAR', 'SOLEDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (19, 'BAKARNE', 'SOLEDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (20, 'BAKENE', 'IRENE');
INSERT INTO synonym(id, word, synonym)
VALUES (21, 'BALADI', 'BLAS');
INSERT INTO synonym(id, word, synonym)
VALUES (23, 'BALE', 'BASEL');
INSERT INTO synonym(id, word, synonym)
VALUES (24, 'BALENDIN', 'VALENTIN');
INSERT INTO synonym(id, word, synonym)
VALUES (25, 'BALERE', 'VALERIA');
INSERT INTO synonym(id, word, synonym)
VALUES (26, 'BALEREN', 'VALERIO');
INSERT INTO synonym(id, word, synonym)
VALUES (32, 'BANDEIRANTES', 'BANDEIRANTE');
INSERT INTO synonym(id, word, synonym)
VALUES (44, 'BARAXIL', 'BASILIO');
INSERT INTO synonym(id, word, synonym)
VALUES (45, 'BARDOL', 'BARTOLOME');
INSERT INTO synonym(id, word, synonym)
VALUES (46, 'BARTOLOMEU', 'BARTOLOME');
INSERT INTO synonym(id, word, synonym)
VALUES (47, 'BARTOMEU', 'BARTOLOME');
INSERT INTO synonym(id, word, synonym)
VALUES (51, 'BAZIL', 'BASILIO');
INSERT INTO synonym(id, word, synonym)
VALUES (52, 'BAZKOARE', 'PASCUAL');
INSERT INTO synonym(id, word, synonym)
VALUES (60, 'BENAT', 'BERNARDO');
INSERT INTO synonym(id, word, synonym)
VALUES (61, 'BENEDITO', 'BENITO');
INSERT INTO synonym(id, word, synonym)
VALUES (64, 'BENET', 'BENITO');
INSERT INTO synonym(id, word, synonym)
VALUES (67, 'BENVIDO', 'BIENVENIDO');
INSERT INTO synonym(id, word, synonym)
VALUES (69, 'BERBIZ', 'RESURRECCION');
INSERT INTO synonym(id, word, synonym)
VALUES (71, 'BERNALDINO', 'BERNARDO');
INSERT INTO synonym(id, word, synonym)
VALUES (73, 'BERNAT', 'BERNARDO');
INSERT INTO synonym(id, word, synonym)
VALUES (75, 'BERTHOUD', 'BURGDORF');
INSERT INTO synonym(id, word, synonym)
VALUES (76, 'BERTOL', 'BARTOLOME');
INSERT INTO synonym(id, word, synonym)
VALUES (77, 'BESAGAITZ', 'ETSAIN');
INSERT INTO synonym(id, word, synonym)
VALUES (78, 'BETIKO', 'BETISA');
INSERT INTO synonym(id, word, synonym)
VALUES (79, 'BETIRI', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (80, 'BIBINE', 'VIVIANA');
INSERT INTO synonym(id, word, synonym)
VALUES (81, 'BIDANE', 'CAMINO');
INSERT INTO synonym(id, word, synonym)
VALUES (82, 'BIDARI', 'VIATOR');
INSERT INTO synonym(id, word, synonym)
VALUES (83, 'BIEITA', 'BENITA');
INSERT INTO synonym(id, word, synonym)
VALUES (84, 'BIEITO', 'BENITO');
INSERT INTO synonym(id, word, synonym)
VALUES (85, 'BIETO', 'BENITO');
INSERT INTO synonym(id, word, synonym)
VALUES (86, 'BIHOTZ', 'CORAZON');
INSERT INTO synonym(id, word, synonym)
VALUES (87, 'BIKENDI', 'VICENTE');
INSERT INTO synonym(id, word, synonym)
VALUES (88, 'BINGENE', 'VICENTA');
INSERT INTO synonym(id, word, synonym)
VALUES (89, 'BINGENT', 'VICENTE');
INSERT INTO synonym(id, word, synonym)
VALUES (91, 'BIRJAIO', 'RENATO');
INSERT INTO synonym(id, word, synonym)
VALUES (92, 'BITTOR', 'VICTOR');
INSERT INTO synonym(id, word, synonym)
VALUES (93, 'BITTORE', 'VICTORIA');
INSERT INTO synonym(id, word, synonym)
VALUES (94, 'BITTORI', 'VICTORIA');
INSERT INTO synonym(id, word, synonym)
VALUES (95, 'BITXI', 'GEMA');
INSERT INTO synonym(id, word, synonym)
VALUES (96, 'BITXILORE', 'MARGARITA');
INSERT INTO synonym(id, word, synonym)
VALUES (97, 'BIXENTA', 'VICENTA');
INSERT INTO synonym(id, word, synonym)
VALUES (98, 'BIXINTXO', 'VICENTE');
INSERT INTO synonym(id, word, synonym)
VALUES (99, 'BIZI', 'VIDAL');
INSERT INTO synonym(id, word, synonym)
VALUES (100, 'BLADI', 'BLAS');
INSERT INTO synonym(id, word, synonym)
VALUES (101, 'BLAI', 'BLAS');
INSERT INTO synonym(id, word, synonym)
VALUES (106, 'BOAVENTURA', 'BUENAVENTURA');
INSERT INTO synonym(id, word, synonym)
VALUES (109, 'BONAVENTURA', 'BUENAVENTURA');
INSERT INTO synonym(id, word, synonym)
VALUES (110, 'BONIFAC', 'BONIFACIO');
INSERT INTO synonym(id, word, synonym)
VALUES (116, 'BRAIS', 'BLAS');
INSERT INTO synonym(id, word, synonym)
VALUES (117, 'BRANCA', 'BLANCA');
INSERT INTO synonym(id, word, synonym)
VALUES (129, 'BRIXIDA', 'BRIGIDA');
INSERT INTO synonym(id, word, synonym)
VALUES (142, 'CAETANO', 'CAYETANO');
INSERT INTO synonym(id, word, synonym)
VALUES (144, 'CAIO', 'CAYETANO');
INSERT INTO synonym(id, word, synonym)
VALUES (148, 'CAITAN', 'CAYETANO');
INSERT INTO synonym(id, word, synonym)
VALUES (152, 'CALISTO', 'CALIXTO');
INSERT INTO synonym(id, word, synonym)
VALUES (153, 'CALROS', 'CARLOS');
INSERT INTO synonym(id, word, synonym)
VALUES (157, 'CAMI', 'CAMINO');
INSERT INTO synonym(id, word, synonym)
VALUES (162, 'CARIDADE', 'CARIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (163, 'CARITAT', 'CARIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (166, 'CARMEL', 'CARMELO');
INSERT INTO synonym(id, word, synonym)
VALUES (167, 'CARMELA', 'CARMEN');
INSERT INTO synonym(id, word, synonym)
VALUES (171, 'CATERINA', 'CATALINA');
INSERT INTO synonym(id, word, synonym)
VALUES (174, 'CEL', 'CIELO');
INSERT INTO synonym(id, word, synonym)
VALUES (175, 'CELDONI', 'CELEDONIO');
INSERT INTO synonym(id, word, synonym)
VALUES (176, 'CELESTI', 'CELESTINO');
INSERT INTO synonym(id, word, synonym)
VALUES (178, 'CELONI', 'CELEDONIO');
INSERT INTO synonym(id, word, synonym)
VALUES (189, 'CEU', 'CIELO');
INSERT INTO synonym(id, word, synonym)
VALUES (191, 'CHELO', 'CONSUELO');
INSERT INTO synonym(id, word, synonym)
VALUES (192, 'CHEM', 'CHEMICAL');
INSERT INTO synonym(id, word, synonym)
VALUES (194, 'CHEMS', 'CHEMICAL');
INSERT INTO synonym(id, word, synonym)
VALUES (197, 'CHRISTIANIA', 'CHRISTIANA');
INSERT INTO synonym(id, word, synonym)
VALUES (205, 'CLAUDI', 'CLAUDIO');
INSERT INTO synonym(id, word, synonym)
VALUES (206, 'CLAVELL', 'CLAVEL');
INSERT INTO synonym(id, word, synonym)
VALUES (208, 'CLIMENT', 'CLEMENTE');
INSERT INTO synonym(id, word, synonym)
VALUES (209, 'CLODIA', 'CLAUDIA');
INSERT INTO synonym(id, word, synonym)
VALUES (210, 'CLODIO', 'CLAUDIO');
INSERT INTO synonym(id, word, synonym)
VALUES (211, 'CNTRL', 'CENTRAL');
INSERT INTO synonym(id, word, synonym)
VALUES (212, 'CO', 'COMPANY');
INSERT INTO synonym(id, word, synonym)
VALUES (213, 'COLL', 'COLLECTION');
INSERT INTO synonym(id, word, synonym)
VALUES (218, 'COMBA', 'PALOMA');
INSERT INTO synonym(id, word, synonym)
VALUES (229, 'COMML', 'COMMERCIAL');
INSERT INTO synonym(id, word, synonym)
VALUES (231, 'COMP', 'COMPANY');
INSERT INTO synonym(id, word, synonym)
VALUES (237, 'COMPT', 'COMPTROLLER');
INSERT INTO synonym(id, word, synonym)
VALUES (244, 'CONSOL', 'CONSUELO');
INSERT INTO synonym(id, word, synonym)
VALUES (247, 'CONST', 'CONSTRUCTION');
INSERT INTO synonym(id, word, synonym)
VALUES (268, 'COR', 'CORAZON');
INSERT INTO synonym(id, word, synonym)
VALUES (269, 'CORP', 'CORPORATION');
INSERT INTO synonym(id, word, synonym)
VALUES (275, 'CR', 'CREDIT');
INSERT INTO synonym(id, word, synonym)
VALUES (276, 'CRED', 'CREDIT');
INSERT INTO synonym(id, word, synonym)
VALUES (283, 'CREU', 'CRUZ');
INSERT INTO synonym(id, word, synonym)
VALUES (284, 'CRISTO', 'CHRIST');
INSERT INTO synonym(id, word, synonym)
VALUES (285, 'CRISTOVO', 'CRISTOBAL');
INSERT INTO synonym(id, word, synonym)
VALUES (288, 'CTRL', 'CONTROL');
INSERT INTO synonym(id, word, synonym)
VALUES (293, 'CUR', 'CURRENT');
INSERT INTO synonym(id, word, synonym)
VALUES (299, 'DEI', 'ANUNCIACION');
INSERT INTO synonym(id, word, synonym)
VALUES (300, 'DEINE', 'ANUNCIACION');
INSERT INTO synonym(id, word, synonym)
VALUES (306, 'DEM', 'DEMOCRATIC');
INSERT INTO synonym(id, word, synonym)
VALUES (308, 'DENIS', 'DIONISIO');
INSERT INTO synonym(id, word, synonym)
VALUES (319, 'DEPT', 'DEPARTMENT');
INSERT INTO synonym(id, word, synonym)
VALUES (322, 'DEUNORO', 'SANTOS');
INSERT INTO synonym(id, word, synonym)
VALUES (330, 'DEV', 'DEVELOPMENT');
INSERT INTO synonym(id, word, synonym)
VALUES (331, 'DEVEL', 'DEVELOPMENT');
INSERT INTO synonym(id, word, synonym)
VALUES (336, 'DIDAC', 'DIEGO');
INSERT INTO synonym(id, word, synonym)
VALUES (338, 'DIEGOTXE', 'DIEGO');
INSERT INTO synonym(id, word, synonym)
VALUES (339, 'DIN', 'ALDIN');
INSERT INTO synonym(id, word, synonym)
VALUES (340, 'DINIS', 'DIONISIO');
INSERT INTO synonym(id, word, synonym)
VALUES (341, 'DIOCELINA', 'DIOSELINA');
INSERT INTO synonym(id, word, synonym)
VALUES (342, 'DIONIS', 'DIONISIO');
INSERT INTO synonym(id, word, synonym)
VALUES (344, 'DISC', 'DISCOUNT');
INSERT INTO synonym(id, word, synonym)
VALUES (346, 'DIST', 'DISTRICT');
INSERT INTO synonym(id, word, synonym)
VALUES (347, 'DISTIRA', 'FULGENCIA');
INSERT INTO synonym(id, word, synonym)
VALUES (348, 'DISTIRATSU', 'FULGENCIO');
INSERT INTO synonym(id, word, synonym)
VALUES (351, 'DIV', 'DIVISION');
INSERT INTO synonym(id, word, synonym)
VALUES (354, 'DOATASUN', 'BUENAVENTURA');
INSERT INTO synonym(id, word, synonym)
VALUES (355, 'DOLC', 'DULCE');
INSERT INTO synonym(id, word, synonym)
VALUES (358, 'DOMEKA', 'DOMINGA');
INSERT INTO synonym(id, word, synonym)
VALUES (359, 'DOMENEC', 'DOMINGO');
INSERT INTO synonym(id, word, synonym)
VALUES (360, 'DOMIKU', 'DOMINGO');
INSERT INTO synonym(id, word, synonym)
VALUES (361, 'DOMIKUZA', 'DOMINGA');
INSERT INTO synonym(id, word, synonym)
VALUES (368, 'DOMINIX', 'DOMINGO');
INSERT INTO synonym(id, word, synonym)
VALUES (371, 'DONETZINE', 'BENITA');
INSERT INTO synonym(id, word, synonym)
VALUES (372, 'DORES', 'DOLORES');
INSERT INTO synonym(id, word, synonym)
VALUES (374, 'DUNIXE', 'DIONISIA');
INSERT INTO synonym(id, word, synonym)
VALUES (375, 'DUNIXI', 'DIONISIO');
INSERT INTO synonym(id, word, synonym)
VALUES (378, 'EA', 'EAST');
INSERT INTO synonym(id, word, synonym)
VALUES (380, 'ECHEBARRI', 'ECHEVARRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (382, 'ECHEBE', 'ECHEVERRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (392, 'EDORTA', 'EDUARDO');
INSERT INTO synonym(id, word, synonym)
VALUES (395, 'EDURNE', 'NIEVES');
INSERT INTO synonym(id, word, synonym)
VALUES (396, 'EDUVIXES', 'EDUVIGIS');
INSERT INTO synonym(id, word, synonym)
VALUES (399, 'EGUNTSENTI', 'AURORA');
INSERT INTO synonym(id, word, synonym)
VALUES (400, 'EGUZKINE', 'SOL');
INSERT INTO synonym(id, word, synonym)
VALUES (403, 'EKHINE', 'SOL');
INSERT INTO synonym(id, word, synonym)
VALUES (405, 'ELAZAR', 'LAZARO');
INSERT INTO synonym(id, word, synonym)
VALUES (406, 'ELEAZAR', 'LAZARO');
INSERT INTO synonym(id, word, synonym)
VALUES (417, 'ELGADAFI', 'GADAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (418, 'ELGADDAFI', 'GADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (419, 'ELGADHAFI', 'GADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (420, 'ELI', 'ELIAS');
INSERT INTO synonym(id, word, synonym)
VALUES (422, 'ELIONOR', 'LEONOR');
INSERT INTO synonym(id, word, synonym)
VALUES (423, 'ELISABET', 'ISABEL');
INSERT INTO synonym(id, word, synonym)
VALUES (424, 'ELISABETE', 'ISABEL');
INSERT INTO synonym(id, word, synonym)
VALUES (426, 'ELIXABETE', 'ISABEL');
INSERT INTO synonym(id, word, synonym)
VALUES (427, 'ELIXIO', 'ELOY');
INSERT INTO synonym(id, word, synonym)
VALUES (428, 'ELKAZZAFI', 'KADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (429, 'ELLANDE', 'FERNANDO');
INSERT INTO synonym(id, word, synonym)
VALUES (430, 'ELNILEIN', 'NILEIN');
INSERT INTO synonym(id, word, synonym)
VALUES (433, 'EMPLOYEES', 'EMPLOYEE');
INSERT INTO synonym(id, word, synonym)
VALUES (434, 'ENAUT', 'FERNANDO');
INSERT INTO synonym(id, word, synonym)
VALUES (435, 'ENDIKA', 'ENRIQUE');
INSERT INTO synonym(id, word, synonym)
VALUES (436, 'ENDIRA', 'ENRIQUE');
INSERT INTO synonym(id, word, synonym)
VALUES (440, 'ENRIC', 'ENRIQUE');
INSERT INTO synonym(id, word, synonym)
VALUES (441, 'ENRIQUE', 'HENRY');
INSERT INTO synonym(id, word, synonym)
VALUES (444, 'ERDINE', 'PARTO');
INSERT INTO synonym(id, word, synonym)
VALUES (445, 'EREINOTZ', 'LAUREANO');
INSERT INTO synonym(id, word, synonym)
VALUES (446, 'ERISENDA', 'LEIRE');
INSERT INTO synonym(id, word, synonym)
VALUES (447, 'ERLANTZ', 'FERNANDO');
INSERT INTO synonym(id, word, synonym)
VALUES (448, 'ERMINE', 'HERMINIA');
INSERT INTO synonym(id, word, synonym)
VALUES (449, 'ERMISENDA', 'LEIRE');
INSERT INTO synonym(id, word, synonym)
VALUES (450, 'ERRAMU', 'RAMOS');
INSERT INTO synonym(id, word, synonym)
VALUES (451, 'ERRAMUN', 'RAMON');
INSERT INTO synonym(id, word, synonym)
VALUES (452, 'ERRAMUNE', 'RAMONA');
INSERT INTO synonym(id, word, synonym)
VALUES (453, 'ERRANDO', 'FERNANDO');
INSERT INTO synonym(id, word, synonym)
VALUES (454, 'ERRAPEL', 'RAFAEL');
INSERT INTO synonym(id, word, synonym)
VALUES (455, 'ERREGINA', 'REGINA');
INSERT INTO synonym(id, word, synonym)
VALUES (456, 'ERRITE', 'RITA');
INSERT INTO synonym(id, word, synonym)
VALUES (457, 'ERROLAN', 'ROLDAN');
INSERT INTO synonym(id, word, synonym)
VALUES (458, 'ERROMAN', 'ROMAN');
INSERT INTO synonym(id, word, synonym)
VALUES (459, 'ERROMANE', 'ROMANA');
INSERT INTO synonym(id, word, synonym)
VALUES (460, 'ERROSALI', 'ROSARIO');
INSERT INTO synonym(id, word, synonym)
VALUES (461, 'ERRUKI', 'PIO');
INSERT INTO synonym(id, word, synonym)
VALUES (462, 'ERRUKINE', 'PIEDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (463, 'ESKARNE', 'MERCEDES');
INSERT INTO synonym(id, word, synonym)
VALUES (470, 'EST', 'ESTABLISHMENT');
INSERT INTO synonym(id, word, synonym)
VALUES (472, 'ESTANISLAU', 'ESTANISLAO');
INSERT INTO synonym(id, word, synonym)
VALUES (475, 'ESTEBE', 'ESTEBAN');
INSERT INTO synonym(id, word, synonym)
VALUES (476, 'ESTEBENI', 'ESTEFANIA');
INSERT INTO synonym(id, word, synonym)
VALUES (477, 'ESTELA', 'ESTRELLA');
INSERT INTO synonym(id, word, synonym)
VALUES (478, 'ESTEVE', 'ESTEBAN');
INSERT INTO synonym(id, word, synonym)
VALUES (479, 'ESTEVO', 'ESTEBAN');
INSERT INTO synonym(id, word, synonym)
VALUES (480, '1ST', 'FIRST');
INSERT INTO synonym(id, word, synonym)
VALUES (481, '2ND', 'SECOND');
INSERT INTO synonym(id, word, synonym)
VALUES (482, '3RD', 'THIRD');
INSERT INTO synonym(id, word, synonym)
VALUES (483, '5TH', 'FIFTH');
INSERT INTO synonym(id, word, synonym)
VALUES (485, 'ABARNE', 'RAMOS');
INSERT INTO synonym(id, word, synonym)
VALUES (486, 'ABD AL', 'ABDUL');
INSERT INTO synonym(id, word, synonym)
VALUES (487, 'ABD EL', 'ABDUL');
INSERT INTO synonym(id, word, synonym)
VALUES (488, 'ABDEL', 'ABDUL');
INSERT INTO synonym(id, word, synonym)
VALUES (493, 'ACCT', 'ACCOUNT');
INSERT INTO synonym(id, word, synonym)
VALUES (495, 'ACHIVALDO', 'ARCHIBALDO');
INSERT INTO synonym(id, word, synonym)
VALUES (497, 'ADAME', 'ADAN');
INSERT INTO synonym(id, word, synonym)
VALUES (498, 'ADMIN', 'ADMINISTRATION');
INSERT INTO synonym(id, word, synonym)
VALUES (501, 'ADONINE', 'ANTONIA');
INSERT INTO synonym(id, word, synonym)
VALUES (503, 'ADVTG', 'ADVERTISING');
INSERT INTO synonym(id, word, synonym)
VALUES (515, 'AGATA', 'AGUEDA');
INSERT INTO synonym(id, word, synonym)
VALUES (516, 'AGATE', 'AGUEDA');
INSERT INTO synonym(id, word, synonym)
VALUES (523, 'AGNES', 'INES');
INSERT INTO synonym(id, word, synonym)
VALUES (524, 'AGOSTI', 'AGUSTIN');
INSERT INTO synonym(id, word, synonym)
VALUES (526, 'AGOSTINO', 'AGUSTIN');
INSERT INTO synonym(id, word, synonym)
VALUES (533, 'AGURNE', 'ROSARIO');
INSERT INTO synonym(id, word, synonym)
VALUES (534, 'AGURTZANE', 'ROSARIO');
INSERT INTO synonym(id, word, synonym)
VALUES (540, 'AINGERU', 'ANGEL');
INSERT INTO synonym(id, word, synonym)
VALUES (542, 'AINTZA', 'GLORIA');
INSERT INTO synonym(id, word, synonym)
VALUES (543, 'AINTZANE', 'GLORIA');
INSERT INTO synonym(id, word, synonym)
VALUES (544, 'AIORA', 'LEIRE');
INSERT INTO synonym(id, word, synonym)
VALUES (546, 'AKKRA', 'ACCRA');
INSERT INTO synonym(id, word, synonym)
VALUES (547, 'ALADAI', 'ALDAY');
INSERT INTO synonym(id, word, synonym)
VALUES (548, 'ALATZ', 'MILAGROS');
INSERT INTO synonym(id, word, synonym)
VALUES (549, 'ALAZNE', 'MILAGROS');
INSERT INTO synonym(id, word, synonym)
VALUES (550, 'ALBASHIR', 'BASHIR');
INSERT INTO synonym(id, word, synonym)
VALUES (552, 'ALBI', 'ALBINO');
INSERT INTO synonym(id, word, synonym)
VALUES (554, 'ALEIXO', 'ALEJO');
INSERT INTO synonym(id, word, synonym)
VALUES (557, 'ALESANDER', 'ALEJANDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (558, 'ALEXANDER', 'ALEJANDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (560, 'ALEXANDRE', 'ALEJANDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (566, 'ALGERIENNE', 'ALGERIAN');
INSERT INTO synonym(id, word, synonym)
VALUES (567, 'ALHARAKAT', 'HARAKAT');
INSERT INTO synonym(id, word, synonym)
VALUES (569, 'ALIZE', 'ALICIA');
INSERT INTO synonym(id, word, synonym)
VALUES (570, 'ALJAMAHIRIYA', 'JAMAHIRIYA');
INSERT INTO synonym(id, word, synonym)
VALUES (571, 'ALKADAFI', 'KADAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (572, 'ALKADDAFI', 'KADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (573, 'ALKARTUM', 'KHARTOUM');
INSERT INTO synonym(id, word, synonym)
VALUES (574, 'ALKHADDAFI', 'KADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (575, 'ALKHARTOUM', 'KHARTOUM');
INSERT INTO synonym(id, word, synonym)
VALUES (576, 'ALKHARTUM', 'KHARTOUM');
INSERT INTO synonym(id, word, synonym)
VALUES (577, 'ALLANDE', 'ARNALDO');
INSERT INTO synonym(id, word, synonym)
VALUES (580, 'ALQADHDHAFI', 'ALQADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (581, 'ALQASSAM', 'QASSAM');
INSERT INTO synonym(id, word, synonym)
VALUES (586, 'ALZAWAHIRI', 'ZAWAHIRI');
INSERT INTO synonym(id, word, synonym)
VALUES (587, 'AMATZA', 'ERMITA');
INSERT INTO synonym(id, word, synonym)
VALUES (589, 'AMER', 'AMERICA');
INSERT INTO synonym(id, word, synonym)
VALUES (598, 'ANAEAXI', 'ENGRACIA');
INSERT INTO synonym(id, word, synonym)
VALUES (599, 'ANAUT', 'ARNALDO');
INSERT INTO synonym(id, word, synonym)
VALUES (600, 'ANDER', 'ANDRES');
INSERT INTO synonym(id, word, synonym)
VALUES (601, 'ANDIMA', 'ANTIMO');
INSERT INTO synonym(id, word, synonym)
VALUES (602, 'ANDOLIN', 'ANTOLIN');
INSERT INTO synonym(id, word, synonym)
VALUES (604, 'ANDONE', 'ANTONIA');
INSERT INTO synonym(id, word, synonym)
VALUES (605, 'ANDONI', 'ANTONIO');
INSERT INTO synonym(id, word, synonym)
VALUES (608, 'ANES', 'INES');
INSERT INTO synonym(id, word, synonym)
VALUES (610, 'ANIXI', 'ANISIO');
INSERT INTO synonym(id, word, synonym)
VALUES (612, 'ANNE', 'ANA');
INSERT INTO synonym(id, word, synonym)
VALUES (619, 'ANTON', 'ANTONIO');
INSERT INTO synonym(id, word, synonym)
VALUES (622, 'ANTTON', 'ANTONIO');
INSERT INTO synonym(id, word, synonym)
VALUES (623, 'ANTWERPSE', 'ANTWERP');
INSERT INTO synonym(id, word, synonym)
VALUES (624, 'ANTXONE', 'ANTONIA');
INSERT INTO synonym(id, word, synonym)
VALUES (627, 'ANXO', 'ANGEL');
INSERT INTO synonym(id, word, synonym)
VALUES (628, 'ANXOS', 'ANGELA');
INSERT INTO synonym(id, word, synonym)
VALUES (629, 'APAL', 'MODESTO');
INSERT INTO synonym(id, word, synonym)
VALUES (634, 'ARANCHA', 'ARANZAZU');
INSERT INTO synonym(id, word, synonym)
VALUES (635, 'ARANTXA', 'ARANZAZU');
INSERT INTO synonym(id, word, synonym)
VALUES (636, 'ARANTZA', 'ARANZAZU');
INSERT INTO synonym(id, word, synonym)
VALUES (641, 'ARGI', 'LUZ');
INSERT INTO synonym(id, word, synonym)
VALUES (642, 'ARGINE', 'LUZ');
INSERT INTO synonym(id, word, synonym)
VALUES (643, 'ARNAU', 'ARNALDO');
INSERT INTO synonym(id, word, synonym)
VALUES (645, 'ARROSA', 'ROSA');
INSERT INTO synonym(id, word, synonym)
VALUES (646, 'ARROSALI', 'ROSARIO');
INSERT INTO synonym(id, word, synonym)
VALUES (648, 'ARTZAI', 'PASTOR');
INSERT INTO synonym(id, word, synonym)
VALUES (655, 'ASSN', 'ASSOCIATION');
INSERT INTO synonym(id, word, synonym)
VALUES (656, 'ASSOC', 'ASSOCIATION');
INSERT INTO synonym(id, word, synonym)
VALUES (660, 'ASST', 'ASSISTANT');
INSERT INTO synonym(id, word, synonym)
VALUES (661, 'ASSUDAN', 'SUDAN');
INSERT INTO synonym(id, word, synonym)
VALUES (663, 'ATERBE', 'PATROCINIO');
INSERT INTO synonym(id, word, synonym)
VALUES (666, 'ATSEGINE', 'CONSUELO');
INSERT INTO synonym(id, word, synonym)
VALUES (667, 'ATT', 'ATTENTION');
INSERT INTO synonym(id, word, synonym)
VALUES (668, 'ATTIQUE', 'ATTICA');
INSERT INTO synonym(id, word, synonym)
VALUES (669, 'ATTN', 'ATTENTION');
INSERT INTO synonym(id, word, synonym)
VALUES (670, 'ATXIRICA', 'ACHIRICA');
INSERT INTO synonym(id, word, synonym)
VALUES (671, 'AUGUST', 'AUGUSTO');
INSERT INTO synonym(id, word, synonym)
VALUES (672, 'AURI', 'AUREO');
INSERT INTO synonym(id, word, synonym)
VALUES (673, 'AURKEN', 'PRESENTACION');
INSERT INTO synonym(id, word, synonym)
VALUES (674, 'AURKENE', 'PRESENTACION');
INSERT INTO synonym(id, word, synonym)
VALUES (675, 'AURO', 'ARCE');
INSERT INTO synonym(id, word, synonym)
VALUES (676, 'ESTRELA', 'ESTRELLA');
INSERT INTO synonym(id, word, synonym)
VALUES (679, 'ETOR', 'HECTOR');
INSERT INTO synonym(id, word, synonym)
VALUES (680, 'ETORNE', 'HECTOR');
INSERT INTO synonym(id, word, synonym)
VALUES (681, 'ETXABE', 'ECHAVE');
INSERT INTO synonym(id, word, synonym)
VALUES (682, 'ETXARTE', 'ECHARTE');
INSERT INTO synonym(id, word, synonym)
VALUES (683, 'ETXAVE', 'ECHAVE');
INSERT INTO synonym(id, word, synonym)
VALUES (684, 'ETXEBARRI', 'ECHEVARRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (685, 'ETXEBARRIA', 'ECHEVARRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (686, 'ETXEBE', 'ECHEVERRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (687, 'ETXEBERRI', 'ECHEVERRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (688, 'ETXEBERRIA', 'ECHEVERRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (689, 'ETXEBESTE', 'ECHEVESTE');
INSERT INTO synonym(id, word, synonym)
VALUES (690, 'ETXEGARAI', 'ECHEGARAY');
INSERT INTO synonym(id, word, synonym)
VALUES (691, 'ETXEGARAY', 'ECHEGARAY');
INSERT INTO synonym(id, word, synonym)
VALUES (692, 'ETXEVARRI', 'ECHEVARRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (693, 'ETXEVARRIA', 'ECHEVARRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (694, 'ETXEVE', 'ECHEVERRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (695, 'ETXEVERRI', 'ECHEVERRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (696, 'ETXEVERRIA', 'ECHEVERRIA');
INSERT INTO synonym(id, word, synonym)
VALUES (697, 'ETXEVESTE', 'ECHEVESTE');
INSERT INTO synonym(id, word, synonym)
VALUES (698, 'EULARI', 'EULALIA');
INSERT INTO synonym(id, word, synonym)
VALUES (713, 'EZTEBE', 'ESTEBAN');
INSERT INTO synonym(id, word, synonym)
VALUES (718, 'FCO', 'FRANCISCO');
INSERT INTO synonym(id, word, synonym)
VALUES (719, 'FED', 'FEDERAL');
INSERT INTO synonym(id, word, synonym)
VALUES (723, 'FELEIZIA', 'LABIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (725, 'FELICITAS', 'FELICIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (727, 'FERNAN', 'FERNANDO');
INSERT INTO synonym(id, word, synonym)
VALUES (728, 'FERRAN', 'FERNANDO');
INSERT INTO synonym(id, word, synonym)
VALUES (744, 'FINIA', 'LEATXE');
INSERT INTO synonym(id, word, synonym)
VALUES (746, 'FIRENZE', 'FLORENCE');
INSERT INTO synonym(id, word, synonym)
VALUES (747, 'FIRMINO', 'FERMIN');
INSERT INTO synonym(id, word, synonym)
VALUES (748, 'FIZ', 'FELIX');
INSERT INTO synonym(id, word, synonym)
VALUES (753, 'FLORENTXI', 'FLORENCIA');
INSERT INTO synonym(id, word, synonym)
VALUES (754, 'FLORO', 'FLORENCIO');
INSERT INTO synonym(id, word, synonym)
VALUES (758, 'FORTUN', 'FORTUNIO');
INSERT INTO synonym(id, word, synonym)
VALUES (765, 'FRANCESC', 'FRANCISCO');
INSERT INTO synonym(id, word, synonym)
VALUES (767, 'FRANTSESA', 'FRANCISCA');
INSERT INTO synonym(id, word, synonym)
VALUES (768, 'FRANTXA', 'FRANCISCA');
INSERT INTO synonym(id, word, synonym)
VALUES (769, 'FRANTZES', 'FRANCISCO');
INSERT INTO synonym(id, word, synonym)
VALUES (770, 'FRANTZISKA', 'FRANCISCA');
INSERT INTO synonym(id, word, synonym)
VALUES (771, 'FRANTZIZKO', 'FRANCISCO');
INSERT INTO synonym(id, word, synonym)
VALUES (773, 'FREDERIC', 'FEDERICO');
INSERT INTO synonym(id, word, synonym)
VALUES (776, 'FREDERIK', 'FEDERICO');
INSERT INTO synonym(id, word, synonym)
VALUES (780, 'FRUITUTSU', 'FRUCTUOSA');
INSERT INTO synonym(id, word, synonym)
VALUES (784, 'GABONE', 'NATIVIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (786, 'GADAFFY', 'GADAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (789, 'GADDAFFY', 'GADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (792, 'GADHAFFY', 'GADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (794, 'GAIETA', 'CAYETANO');
INSERT INTO synonym(id, word, synonym)
VALUES (795, 'GAIZKA', 'SALVADOR');
INSERT INTO synonym(id, word, synonym)
VALUES (796, 'GALLARET', 'AMAPOLA');
INSERT INTO synonym(id, word, synonym)
VALUES (797, 'GALLEN', 'GALL');
INSERT INTO synonym(id, word, synonym)
VALUES (798, 'GALLISCHE', 'GALL');
INSERT INTO synonym(id, word, synonym)
VALUES (800, 'GALLOIS', 'GALL');
INSERT INTO synonym(id, word, synonym)
VALUES (801, 'GANIX', 'JUAN');
INSERT INTO synonym(id, word, synonym)
VALUES (802, 'GARAILE', 'VICTOR');
INSERT INTO synonym(id, word, synonym)
VALUES (803, 'GARAINE', 'VICTORIA');
INSERT INTO synonym(id, word, synonym)
VALUES (804, 'GARAITZ', 'VICTORIA');
INSERT INTO synonym(id, word, synonym)
VALUES (805, 'GARAZI', 'GRACIANA');
INSERT INTO synonym(id, word, synonym)
VALUES (806, 'GARBI', 'INMACULADA');
INSERT INTO synonym(id, word, synonym)
VALUES (807, 'GARBIKUNDE', 'INMACULADA');
INSERT INTO synonym(id, word, synonym)
VALUES (808, 'GARBINE', 'INMACULADA');
INSERT INTO synonym(id, word, synonym)
VALUES (811, 'GARTZEN', 'GRACIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (812, 'GARTZENE', 'GRACIA');
INSERT INTO synonym(id, word, synonym)
VALUES (813, 'GARTZI', 'GRACIA');
INSERT INTO synonym(id, word, synonym)
VALUES (814, 'GAXAN', 'GRACIAN');
INSERT INTO synonym(id, word, synonym)
VALUES (815, 'GAXUXA', 'GRACIOSA');
INSERT INTO synonym(id, word, synonym)
VALUES (817, 'GEAXI', 'ENGRACIA');
INSERT INTO synonym(id, word, synonym)
VALUES (819, 'GEN', 'GENERAL');
INSERT INTO synonym(id, word, synonym)
VALUES (824, 'GENETXEA', 'GUENECHEA');
INSERT INTO synonym(id, word, synonym)
VALUES (828, 'GENTZA', 'PAZ');
INSERT INTO synonym(id, word, synonym)
VALUES (829, 'GENTZANE', 'PAZ');
INSERT INTO synonym(id, word, synonym)
VALUES (830, 'GEO', 'GEORGE');
INSERT INTO synonym(id, word, synonym)
VALUES (832, 'GERAXAN', 'GRACIAN');
INSERT INTO synonym(id, word, synonym)
VALUES (833, 'GERAXANE', 'GRACIANA');
INSERT INTO synonym(id, word, synonym)
VALUES (834, 'GERAZAN', 'GRACIAN');
INSERT INTO synonym(id, word, synonym)
VALUES (840, 'GHADDAFY', 'GADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (841, 'GHEDDAFI', 'GADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (842, 'GIL', 'GUILLERMO');
INSERT INTO synonym(id, word, synonym)
VALUES (843, 'GILEN', 'GUILLERMO');
INSERT INTO synonym(id, word, synonym)
VALUES (845, 'GISELLE', 'GISELA');
INSERT INTO synonym(id, word, synonym)
VALUES (847, 'GOI', 'CIELO');
INSERT INTO synonym(id, word, synonym)
VALUES (849, 'GOIRIZELAIA', 'GOIRICELAYA');
INSERT INTO synonym(id, word, synonym)
VALUES (851, 'GOIZARGI', 'AURORA');
INSERT INTO synonym(id, word, synonym)
VALUES (852, 'GORANE', 'EXALTACION');
INSERT INTO synonym(id, word, synonym)
VALUES (853, 'GORATZE', 'EXALTACION');
INSERT INTO synonym(id, word, synonym)
VALUES (854, 'GOREN', 'AUGUSTO');
INSERT INTO synonym(id, word, synonym)
VALUES (855, 'GORKA', 'JORGE');
INSERT INTO synonym(id, word, synonym)
VALUES (856, 'GOTTARDO', 'GOTHARD');
INSERT INTO synonym(id, word, synonym)
VALUES (857, 'GOTZON', 'ANGEL');
INSERT INTO synonym(id, word, synonym)
VALUES (858, 'GOTZONE', 'ANGEL');
INSERT INTO synonym(id, word, synonym)
VALUES (859, 'GOVT', 'GOVERNMENT');
INSERT INTO synonym(id, word, synonym)
VALUES (860, 'GOZO', 'DULCE');
INSERT INTO synonym(id, word, synonym)
VALUES (864, 'GRAXI', 'GRACIANA');
INSERT INTO synonym(id, word, synonym)
VALUES (871, 'GRP', 'GROUP');
INSERT INTO synonym(id, word, synonym)
VALUES (873, 'GUENETXEA', 'GUENECHEA');
INSERT INTO synonym(id, word, synonym)
VALUES (874, 'GUILLEM', 'GUILLERMO');
INSERT INTO synonym(id, word, synonym)
VALUES (876, 'GURE', 'NUESTRA');
INSERT INTO synonym(id, word, synonym)
VALUES (877, 'GURRUTXAGA', 'GURRUCHAGA');
INSERT INTO synonym(id, word, synonym)
VALUES (878, 'GURUTZ', 'CRUZ');
INSERT INTO synonym(id, word, synonym)
VALUES (879, 'GURUTZE', 'CRUZ');
INSERT INTO synonym(id, word, synonym)
VALUES (880, 'GURUZNE', 'CRUZ');
INSERT INTO synonym(id, word, synonym)
VALUES (883, 'HAITZ', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (886, 'HANNI', 'ANIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (889, 'HARKAITZ', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (894, 'HENRIQUE', 'HENRY');
INSERT INTO synonym(id, word, synonym)
VALUES (895, 'HENRIQUES', 'HENRY');
INSERT INTO synonym(id, word, synonym)
VALUES (901, 'HEZBOLLAH', 'HIZBALLAH');
INSERT INTO synonym(id, word, synonym)
VALUES (903, 'HILARGI', 'LUNA');
INSERT INTO synonym(id, word, synonym)
VALUES (906, 'HITZEDER', 'EULOGIO');
INSERT INTO synonym(id, word, synonym)
VALUES (921, 'IAGO', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (922, 'IBAN', 'JUAN');
INSERT INTO synonym(id, word, synonym)
VALUES (923, 'IBON', 'IVON');
INSERT INTO synonym(id, word, synonym)
VALUES (924, 'IBONE', 'IVON');
INSERT INTO synonym(id, word, synonym)
VALUES (927, 'IGNASI', 'IGNACIO');
INSERT INTO synonym(id, word, synonym)
VALUES (928, 'IGON', 'ASCENSION');
INSERT INTO synonym(id, word, synonym)
VALUES (929, 'IGONE', 'ASCENSION');
INSERT INTO synonym(id, word, synonym)
VALUES (930, 'IHAZINTU', 'JACINTO');
INSERT INTO synonym(id, word, synonym)
VALUES (931, 'IHINTZA', 'ROCIO');
INSERT INTO synonym(id, word, synonym)
VALUES (932, 'IKERNE', 'VISITACION');
INSERT INTO synonym(id, word, synonym)
VALUES (934, 'ILAZKI', 'LUNA');
INSERT INTO synonym(id, word, synonym)
VALUES (936, 'IMANOL', 'MANUEL');
INSERT INTO synonym(id, word, synonym)
VALUES (939, 'INAKI', 'IGNACIO');
INSERT INTO synonym(id, word, synonym)
VALUES (940, 'INC', 'INCORPORATED');
INSERT INTO synonym(id, word, synonym)
VALUES (942, 'INDARTSU', 'ROBUSTIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (952, 'INGARTZE', 'ENGRACIA');
INSERT INTO synonym(id, word, synonym)
VALUES (953, 'INGUMA', 'MARIPOSA');
INSERT INTO synonym(id, word, synonym)
VALUES (954, 'INIGO', 'IGNACIO');
INSERT INTO synonym(id, word, synonym)
VALUES (955, 'INS', 'INSURANCE');
INSERT INTO synonym(id, word, synonym)
VALUES (960, 'INT', 'INTERNATIONAL');
INSERT INTO synonym(id, word, synonym)
VALUES (976, 'INTL', 'INTERNATIONAL');
INSERT INTO synonym(id, word, synonym)
VALUES (977, 'INTZA', 'ROCIO');
INSERT INTO synonym(id, word, synonym)
VALUES (978, 'INV', 'INVESTMENT');
INSERT INTO synonym(id, word, synonym)
VALUES (988, 'IRAGARTE', 'ANUNCIACION');
INSERT INTO synonym(id, word, synonym)
VALUES (989, 'IRAKUSNE', 'EPIFANIA');
INSERT INTO synonym(id, word, synonym)
VALUES (992, 'IRAUNKOR', 'CONSTANCIO');
INSERT INTO synonym(id, word, synonym)
VALUES (993, 'IRUNE', 'TRINIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (994, 'IRV', 'IRVING');
INSERT INTO synonym(id, word, synonym)
VALUES (995, 'ISIDOR', 'ISIDORO');
INSERT INTO synonym(id, word, synonym)
VALUES (996, 'ISL', 'ISLAND');
INSERT INTO synonym(id, word, synonym)
VALUES (997, 'ISLAMIYA', 'ALISLAMIYYA');
INSERT INTO synonym(id, word, synonym)
VALUES (998, 'ISLAMIYYA', 'ALISLAMIYYA');
INSERT INTO synonym(id, word, synonym)
VALUES (1011, 'ITSASNE', 'MAR');
INSERT INTO synonym(id, word, synonym)
VALUES (1012, 'ITSASO', 'MAR');
INSERT INTO synonym(id, word, synonym)
VALUES (1013, 'ITXARO', 'ESPERANZA');
INSERT INTO synonym(id, word, synonym)
VALUES (1014, 'ITZAL', 'AMPARO');
INSERT INTO synonym(id, word, synonym)
VALUES (1015, 'IVAN', 'JUAN');
INSERT INTO synonym(id, word, synonym)
VALUES (1016, 'IVOIRE', 'IVORY');
INSERT INTO synonym(id, word, synonym)
VALUES (1017, 'IVOIRIENNE', 'IVORY');
INSERT INTO synonym(id, word, synonym)
VALUES (1018, 'IXAKA', 'ISAAC');
INSERT INTO synonym(id, word, synonym)
VALUES (1019, 'IXIDOR', 'ISIDORO');
INSERT INTO synonym(id, word, synonym)
VALUES (1020, 'IXONE', 'CALMA');
INSERT INTO synonym(id, word, synonym)
VALUES (1021, 'IZAR', 'ESTRELLA');
INSERT INTO synonym(id, word, synonym)
VALUES (1023, 'JACOBO', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1024, 'JAIONE', 'NATIVIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1025, 'JAKES', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1026, 'JAKINDE', 'JACINTA');
INSERT INTO synonym(id, word, synonym)
VALUES (1027, 'JAKOBE', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1028, 'JAKUE', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1031, 'JANPIER', 'JUAN PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1037, 'JOANES', 'JUAN');
INSERT INTO synonym(id, word, synonym)
VALUES (1041, 'JOKIN', 'JOAQUIN');
INSERT INTO synonym(id, word, synonym)
VALUES (1042, 'JOKINE', 'JOAQUINA');
INSERT INTO synonym(id, word, synonym)
VALUES (1043, 'JON', 'JUAN');
INSERT INTO synonym(id, word, synonym)
VALUES (1044, 'JONE', 'JUANA');
INSERT INTO synonym(id, word, synonym)
VALUES (1048, 'JORDI', 'JORGE');
INSERT INTO synonym(id, word, synonym)
VALUES (1049, 'JOSEBA', 'JOSE');
INSERT INTO synonym(id, word, synonym)
VALUES (1050, 'JOSEBE', 'JOSEFA');
INSERT INTO synonym(id, word, synonym)
VALUES (1051, 'JOSELIN', 'JOSE');
INSERT INTO synonym(id, word, synonym)
VALUES (1054, 'JOSEPE', 'JOSE');
INSERT INTO synonym(id, word, synonym)
VALUES (1055, 'JOSU', 'JESUS');
INSERT INTO synonym(id, word, synonym)
VALUES (1056, 'JOSUNE', 'JESUSA');
INSERT INTO synonym(id, word, synonym)
VALUES (1057, 'JOXEPA', 'JOSEFA');
INSERT INTO synonym(id, word, synonym)
VALUES (1060, 'JULEN', 'JULIAN');
INSERT INTO synonym(id, word, synonym)
VALUES (1061, 'JULENE', 'JULIANA');
INSERT INTO synonym(id, word, synonym)
VALUES (1062, 'JURGI', 'JORGE');
INSERT INTO synonym(id, word, synonym)
VALUES (1064, 'JUSTINO', 'JUSTO');
INSERT INTO synonym(id, word, synonym)
VALUES (1066, 'KADAFFY', 'KADAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1069, 'KADDAFFY', 'KADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1072, 'KADHAFFY', 'KADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1074, 'KAIET', 'CAYETANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1075, 'KALARE', 'CLARA');
INSERT INTO synonym(id, word, synonym)
VALUES (1078, 'KARITATE', 'CARIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1079, 'KARMEL', 'CARMELO');
INSERT INTO synonym(id, word, synonym)
VALUES (1080, 'KARMELE', 'CARMEN');
INSERT INTO synonym(id, word, synonym)
VALUES (1082, 'KATALIN', 'CATALINA');
INSERT INTO synonym(id, word, synonym)
VALUES (1083, 'KATERIN', 'CATALINA');
INSERT INTO synonym(id, word, synonym)
VALUES (1084, 'KATIXA', 'CATALINA');
INSERT INTO synonym(id, word, synonym)
VALUES (1085, 'KATTARIN', 'CATALINA');
INSERT INTO synonym(id, word, synonym)
VALUES (1086, 'KAULDI', 'CLAUDIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1087, 'KAZZAFI', 'KADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1088, 'KELEMEN', 'CLEMENTE');
INSERT INTO synonym(id, word, synonym)
VALUES (1089, 'KEPA', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1091, 'KHADAFY', 'KADAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1095, 'KISTINE', 'CRISTINA');
INSERT INTO synonym(id, word, synonym)
VALUES (1099, 'KOLDO', 'LUIS');
INSERT INTO synonym(id, word, synonym)
VALUES (1100, 'KOLDOBIKA', 'LUIS');
INSERT INTO synonym(id, word, synonym)
VALUES (1101, 'KOLDOBIKE', 'LUISA');
INSERT INTO synonym(id, word, synonym)
VALUES (1102, 'KONTXESI', 'CONCEPCION');
INSERT INTO synonym(id, word, synonym)
VALUES (1103, 'KONTZEZIONA', 'CONCEPCION');
INSERT INTO synonym(id, word, synonym)
VALUES (1105, 'KP', 'NORTH KOREA');
INSERT INTO synonym(id, word, synonym)
VALUES (1106, 'KRABELIN', 'CLAVEL');
INSERT INTO synonym(id, word, synonym)
VALUES (1109, 'KUBANISCH', 'KUBA');
INSERT INTO synonym(id, word, synonym)
VALUES (1110, 'KUBANISCHE', 'KUBA');
INSERT INTO synonym(id, word, synonym)
VALUES (1111, 'KUBINSKAYA', 'KUBA');
INSERT INTO synonym(id, word, synonym)
VALUES (1112, 'KUBINSKOYE', 'KUBA');
INSERT INTO synonym(id, word, synonym)
VALUES (1113, 'KUTSUGE', 'PURA');
INSERT INTO synonym(id, word, synonym)
VALUES (1116, 'LAGUNTZANE', 'SOCORRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1118, 'LANDER', 'LEANDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1119, 'LARRETXEA', 'LARRECHEA');
INSERT INTO synonym(id, word, synonym)
VALUES (1122, 'LAURENDI', 'LORENZO');
INSERT INTO synonym(id, word, synonym)
VALUES (1123, 'LAURENTZI', 'LORENZO');
INSERT INTO synonym(id, word, synonym)
VALUES (1124, 'LDN', 'LONDON');
INSERT INTO synonym(id, word, synonym)
VALUES (1127, 'LEHEN', 'PRIMITIVO');
INSERT INTO synonym(id, word, synonym)
VALUES (1128, 'LEHOI', 'LEON');
INSERT INTO synonym(id, word, synonym)
VALUES (1130, 'LER', 'PINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1136, 'LIBERDADE', 'LIBERTAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1138, 'LIDE', 'LIDIA');
INSERT INTO synonym(id, word, synonym)
VALUES (1139, 'LILI', 'LIRIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1140, 'LINEA', 'LINE');
INSERT INTO synonym(id, word, synonym)
VALUES (1141, 'LINEAS', 'LINE');
INSERT INTO synonym(id, word, synonym)
VALUES (1143, 'LIRAIN', 'PRIMOROSA');
INSERT INTO synonym(id, word, synonym)
VALUES (1144, 'LIZAR', 'FRESNO');
INSERT INTO synonym(id, word, synonym)
VALUES (1145, 'LLATZER', 'LAZARO');
INSERT INTO synonym(id, word, synonym)
VALUES (1146, 'LLEO', 'LEON');
INSERT INTO synonym(id, word, synonym)
VALUES (1147, 'LLIRI', 'LIRIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1148, 'LLORENC', 'LORENZO');
INSERT INTO synonym(id, word, synonym)
VALUES (1150, 'LLUC', 'LUCIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1151, 'LLUCIA', 'LUZ');
INSERT INTO synonym(id, word, synonym)
VALUES (1155, 'LND', 'LONDON');
INSERT INTO synonym(id, word, synonym)
VALUES (1156, 'LOCAIA', 'LEOCADIA?ÿ');
INSERT INTO synonym(id, word, synonym)
VALUES (1160, 'LONORE', 'LEONOR');
INSERT INTO synonym(id, word, synonym)
VALUES (1161, 'LORDA', 'LOURDES');
INSERT INTO synonym(id, word, synonym)
VALUES (1162, 'LORE', 'FLORA');
INSERT INTO synonym(id, word, synonym)
VALUES (1163, 'LOREA', 'FLORA');
INSERT INTO synonym(id, word, synonym)
VALUES (1166, 'LTD', 'LIMITED');
INSERT INTO synonym(id, word, synonym)
VALUES (1167, 'LTDA', 'LIMITED');
INSERT INTO synonym(id, word, synonym)
VALUES (1169, 'LUCAS', 'LUCIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1171, 'LUCIA', 'LUZ');
INSERT INTO synonym(id, word, synonym)
VALUES (1174, 'LUKEN', 'LUCIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1175, 'LUKENE', 'LUCIANA');
INSERT INTO synonym(id, word, synonym)
VALUES (1177, 'LUREA', 'LAUREANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1178, 'LUX', 'LUXEMBOURG');
INSERT INTO synonym(id, word, synonym)
VALUES (1184, 'MA', 'MARIA');
INSERT INTO synonym(id, word, synonym)
VALUES (1187, 'MAHERBE', 'MACHERBE');
INSERT INTO synonym(id, word, synonym)
VALUES (1188, 'MAHLERBE', 'MACHERBE');
INSERT INTO synonym(id, word, synonym)
VALUES (1189, 'MAHMOUD', 'MOHAMMAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1190, 'MAHMUD', 'MOHAMMAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1191, 'MAIA', 'MARIA');
INSERT INTO synonym(id, word, synonym)
VALUES (1192, 'MAIALEN', 'MAGDALENA');
INSERT INTO synonym(id, word, synonym)
VALUES (1193, 'MAITAGARRI', 'AMADA');
INSERT INTO synonym(id, word, synonym)
VALUES (1194, 'MAITE', 'AMADA');
INSERT INTO synonym(id, word, synonym)
VALUES (1195, 'MAITEDER', 'AMADA');
INSERT INTO synonym(id, word, synonym)
VALUES (1196, 'MAITENA', 'AMADA');
INSERT INTO synonym(id, word, synonym)
VALUES (1197, 'MAKATZA', 'SILVESTRE');
INSERT INTO synonym(id, word, synonym)
VALUES (1198, 'MALARBE', 'MACHERBE');
INSERT INTO synonym(id, word, synonym)
VALUES (1200, 'MALEN', 'MAGDALENA');
INSERT INTO synonym(id, word, synonym)
VALUES (1201, 'MALERBE', 'MACHERBE');
INSERT INTO synonym(id, word, synonym)
VALUES (1202, 'MALERVA', 'MACHERBE');
INSERT INTO synonym(id, word, synonym)
VALUES (1203, 'MALMERME', 'MACHERBE');
INSERT INTO synonym(id, word, synonym)
VALUES (1207, 'MANEX', 'JUAN');
INSERT INTO synonym(id, word, synonym)
VALUES (1209, 'MANU', 'MANUEL');
INSERT INTO synonym(id, word, synonym)
VALUES (1215, 'MARCEL', 'MARCELO');
INSERT INTO synonym(id, word, synonym)
VALUES (1217, 'MARCO', 'MARK');
INSERT INTO synonym(id, word, synonym)
VALUES (1218, 'MARCOS', 'MARK');
INSERT INTO synonym(id, word, synonym)
VALUES (1219, 'MAREN', 'MARIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1220, 'MARGARIDA', 'MARGARITA');
INSERT INTO synonym(id, word, synonym)
VALUES (1225, 'MARITXU', 'MARIA');
INSERT INTO synonym(id, word, synonym)
VALUES (1226, 'MARKEL', 'MARCIAL');
INSERT INTO synonym(id, word, synonym)
VALUES (1228, 'MARKO', 'MARCOS');
INSERT INTO synonym(id, word, synonym)
VALUES (1233, 'MARTXEL', 'MARCELO');
INSERT INTO synonym(id, word, synonym)
VALUES (1234, 'MARTXELIN', 'MARCELINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1235, 'MARTXELINE', 'MARCELINA');
INSERT INTO synonym(id, word, synonym)
VALUES (1236, 'MARZ', 'MARCOS');
INSERT INTO synonym(id, word, synonym)
VALUES (1240, 'MATEUS', 'MATEO');
INSERT INTO synonym(id, word, synonym)
VALUES (1241, 'MATIA', 'MATEO');
INSERT INTO synonym(id, word, synonym)
VALUES (1242, 'MATIAS', 'MATEO');
INSERT INTO synonym(id, word, synonym)
VALUES (1243, 'MATTIN', 'MARTIN');
INSERT INTO synonym(id, word, synonym)
VALUES (1244, 'MATXIN', 'MARTIN');
INSERT INTO synonym(id, word, synonym)
VALUES (1251, 'MEDER', 'EMETERIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1252, 'MEDERI', 'EMETERIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1256, 'MELARBE', 'MACHERBE');
INSERT INTO synonym(id, word, synonym)
VALUES (1257, 'MENDIKO', 'SILVANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1258, 'MENDOIA', 'OLAGUE');
INSERT INTO synonym(id, word, synonym)
VALUES (1259, 'MERARDO', 'EMETERIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1263, 'MERCE', 'MERCEDES');
INSERT INTO synonym(id, word, synonym)
VALUES (1264, 'MERCES', 'MERCEDES');
INSERT INTO synonym(id, word, synonym)
VALUES (1266, 'MERTXE', 'MARIA JESUS');
INSERT INTO synonym(id, word, synonym)
VALUES (1267, 'MERY', 'MARIA');
INSERT INTO synonym(id, word, synonym)
VALUES (1270, 'MEX', 'MEXICO');
INSERT INTO synonym(id, word, synonym)
VALUES (1275, 'MFG', 'MANUFACTURING');
INSERT INTO synonym(id, word, synonym)
VALUES (1276, 'MGMT', 'MANAGEMENT');
INSERT INTO synonym(id, word, synonym)
VALUES (1277, 'MGR', 'MANAGER');
INSERT INTO synonym(id, word, synonym)
VALUES (1278, 'MGT', 'MANAGEMENT');
INSERT INTO synonym(id, word, synonym)
VALUES (1284, 'MIKEL', 'MIGUEL');
INSERT INTO synonym(id, word, synonym)
VALUES (1285, 'MIKELE', 'MICAELA');
INSERT INTO synonym(id, word, synonym)
VALUES (1286, 'MIKOLAS', 'NICOLAS');
INSERT INTO synonym(id, word, synonym)
VALUES (1302, 'MIRARI', 'MILAGROS');
INSERT INTO synonym(id, word, synonym)
VALUES (1303, 'MIREN', 'MARIA');
INSERT INTO synonym(id, word, synonym)
VALUES (1304, 'MITXEL', 'MIGUEL');
INSERT INTO synonym(id, word, synonym)
VALUES (1305, 'MITXOLETA', 'AMAPOLA');
INSERT INTO synonym(id, word, synonym)
VALUES (1308, 'MOAMAR', 'MUAMMAR');
INSERT INTO synonym(id, word, synonym)
VALUES (1309, 'MOAMER', 'MUAMMAR');
INSERT INTO synonym(id, word, synonym)
VALUES (1314, 'MOHAMED', 'MOHAMMAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1316, 'MOMAR', 'MUAMMAR');
INSERT INTO synonym(id, word, synonym)
VALUES (1317, 'MOMMAR', 'MUAMMAR');
INSERT INTO synonym(id, word, synonym)
VALUES (1319, 'MONTXO', 'DOMINGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1329, 'MUHAMED', 'MOHAMMAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1331, 'MUHAMMED', 'MOHAMMAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1333, 'MUJIKA', 'MUGICA');
INSERT INTO synonym(id, word, synonym)
VALUES (1336, 'MUNTASIR', 'MONTASSIR');
INSERT INTO synonym(id, word, synonym)
VALUES (1340, 'NADAL', 'NATIVIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1341, 'NALHERBE', 'MACHERBE');
INSERT INTO synonym(id, word, synonym)
VALUES (1342, 'NAPOLI', 'NAPLES');
INSERT INTO synonym(id, word, synonym)
VALUES (1347, 'NATIVITAT', 'NATIVIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1348, 'NATL', 'NATIONAL');
INSERT INTO synonym(id, word, synonym)
VALUES (1350, 'NAVIDAD', 'NATIVIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1361, 'NEUS', 'NIEVES');
INSERT INTO synonym(id, word, synonym)
VALUES (1367, 'NIKOLA', 'NICOLAS');
INSERT INTO synonym(id, word, synonym)
VALUES (1385, 'OCIEL', 'OSIEL');
INSERT INTO synonym(id, word, synonym)
VALUES (1387, 'OFF', 'OFFICE');
INSERT INTO synonym(id, word, synonym)
VALUES (1388, 'OFFS', 'OFFICE');
INSERT INTO synonym(id, word, synonym)
VALUES (1394, 'OLENTZERO', 'NOEL');
INSERT INTO synonym(id, word, synonym)
VALUES (1396, 'ONBERA', 'BENIGNO');
INSERT INTO synonym(id, word, synonym)
VALUES (1397, 'ONGILE', 'BONIFACIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1399, 'OPER', 'OPERATION');
INSERT INTO synonym(id, word, synonym)
VALUES (1409, 'ORTZI', 'CIELO');
INSERT INTO synonym(id, word, synonym)
VALUES (1410, 'OSASUN', 'SALUSTIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1411, 'OSKARBI', 'CIELO');
INSERT INTO synonym(id, word, synonym)
VALUES (1413, 'OSPETSU', 'HONORATO');
INSERT INTO synonym(id, word, synonym)
VALUES (1415, 'OSTARGI', 'AURORA');
INSERT INTO synonym(id, word, synonym)
VALUES (1421, 'PABLO', 'PAUL');
INSERT INTO synonym(id, word, synonym)
VALUES (1429, 'PASKAL', 'PASCUAL');
INSERT INTO synonym(id, word, synonym)
VALUES (1432, 'PATXI', 'FRANCISCO');
INSERT INTO synonym(id, word, synonym)
VALUES (1433, 'PAU', 'PABLO');
INSERT INTO synonym(id, word, synonym)
VALUES (1434, 'PAUL', 'PABLO');
INSERT INTO synonym(id, word, synonym)
VALUES (1435, 'PAULIN', 'PABLO');
INSERT INTO synonym(id, word, synonym)
VALUES (1438, 'PEIO', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1440, 'PELI', 'FELIX');
INSERT INTO synonym(id, word, synonym)
VALUES (1444, 'PEO', 'PEOPLE');
INSERT INTO synonym(id, word, synonym)
VALUES (1445, 'PEOP', 'PEOPLE');
INSERT INTO synonym(id, word, synonym)
VALUES (1447, 'PEPE', 'JOSE');
INSERT INTO synonym(id, word, synonym)
VALUES (1448, 'PERE', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1449, 'PERPETUA', 'BETISA');
INSERT INTO synonym(id, word, synonym)
VALUES (1450, 'PERRANDO', 'FERNANDO');
INSERT INTO synonym(id, word, synonym)
VALUES (1451, 'PERU', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1452, 'PERUANTON', 'PEDRO ANTONIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1453, 'PERUTXO', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1454, 'PETRA', 'BETISA');
INSERT INTO synonym(id, word, synonym)
VALUES (1455, 'PETRI', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1457, 'PHANOR', 'FANOR');
INSERT INTO synonym(id, word, synonym)
VALUES (1463, 'PIARRES', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1464, 'PIEDADE', 'PIEDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1465, 'PIETAT', 'PIEDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1467, 'PIUS', 'PIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1470, 'POLENTZI', 'FLORENCIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1474, 'POMBA', 'PALOMA');
INSERT INTO synonym(id, word, synonym)
VALUES (1482, 'POZ', 'GAUDENCIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1485, 'PRIMITIU', 'PRIMITIVO');
INSERT INTO synonym(id, word, synonym)
VALUES (1486, 'PRISCA', 'PRISCILA');
INSERT INTO synonym(id, word, synonym)
VALUES (1503, 'PURIFICACION', 'INMACULADA');
INSERT INTO synonym(id, word, synonym)
VALUES (1505, 'QADAFFY', 'QADAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1506, 'QADDAFFY', 'QADDAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1509, 'QADHAFFY', 'QADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1511, 'QADHDHAFI', 'QADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1512, 'QASSIM', 'ALQASSIM');
INSERT INTO synonym(id, word, synonym)
VALUES (1513, 'QATHAFFI', 'QADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1514, 'QATHAFI', 'QADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1515, 'QUATHAFFI', 'QADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1516, 'QUATHAFI', 'QADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1517, 'QUDHAFFI', 'QADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1518, 'QUDHAFFY', 'QADHAFI');
INSERT INTO synonym(id, word, synonym)
VALUES (1522, 'RAPHAEL', 'RAFAEL');
INSERT INTO synonym(id, word, synonym)
VALUES (1523, 'RCELLI', 'MARCELINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1524, 'RD', 'ROAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1530, 'REIS', 'REYES');
INSERT INTO synonym(id, word, synonym)
VALUES (1531, 'REMIR', 'RAMIRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1545, 'ROSA', 'ROSALBA');
INSERT INTO synonym(id, word, synonym)
VALUES (1546, 'ROSALIA', 'ROSARIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1547, 'ROSELLA', 'AMAPOLA');
INSERT INTO synonym(id, word, synonym)
VALUES (1548, 'ROSER', 'ROSARIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1549, 'ROTLLAN', 'ROLDAN');
INSERT INTO synonym(id, word, synonym)
VALUES (1555, 'RUI', 'RODRIGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1556, 'RUISKO', 'RODRIGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1560, 'SABI', 'SABINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1563, 'SADURNI', 'SATURNINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1565, 'SALBATORE', 'SALVADOR');
INSERT INTO synonym(id, word, synonym)
VALUES (1567, 'SALUD', 'SALUSTIANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1568, 'SANDAILI', 'ELIAS');
INSERT INTO synonym(id, word, synonym)
VALUES (1569, 'SANDURU', 'SANTOS');
INSERT INTO synonym(id, word, synonym)
VALUES (1571, 'SANTI', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1572, 'SANTIO', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1573, 'SANTUTXO', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1574, 'SATORDI', 'SATURNINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1587, 'SEBER', 'SEVERO');
INSERT INTO synonym(id, word, synonym)
VALUES (1589, 'SERV', 'SERVICE');
INSERT INTO synonym(id, word, synonym)
VALUES (1594, 'SERXIO', 'SEGIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1595, 'SEVER', 'SEVERO');
INSERT INTO synonym(id, word, synonym)
VALUES (1596, 'SEYHAN', 'ADANA');
INSERT INTO synonym(id, word, synonym)
VALUES (1597, 'SHEIHK', 'SHAYKH');
INSERT INTO synonym(id, word, synonym)
VALUES (1598, 'SHEIK', 'SHAYKH');
INSERT INTO synonym(id, word, synonym)
VALUES (1599, 'SHEIKH', 'SHAYKH');
INSERT INTO synonym(id, word, synonym)
VALUES (1604, 'SILBAN', 'SILVANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1605, 'SILVA', 'SILVANO');
INSERT INTO synonym(id, word, synonym)
VALUES (1607, 'SIMPLON', 'SEMPIONE');
INSERT INTO synonym(id, word, synonym)
VALUES (1618, 'SOIDADE', 'SOLEDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1626, 'ST.', 'SAINT');
INSERT INTO synonym(id, word, synonym)
VALUES (1636, 'SURINAME', 'SURINAM');
INSERT INTO synonym(id, word, synonym)
VALUES (1647, 'TAREIXA', 'TERESA');
INSERT INTO synonym(id, word, synonym)
VALUES (1658, 'TIBALT', 'TEOBALDO');
INSERT INTO synonym(id, word, synonym)
VALUES (1663, 'TODOR', 'TEODORO');
INSERT INTO synonym(id, word, synonym)
VALUES (1666, 'TORRES', 'TORRE');
INSERT INTO synonym(id, word, synonym)
VALUES (1667, 'TOUFAILI', 'TUFAYLI');
INSERT INTO synonym(id, word, synonym)
VALUES (1669, 'TR', 'TRUST');
INSERT INTO synonym(id, word, synonym)
VALUES (1676, 'TRINDADE', 'TRINIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1677, 'TRINITAT', 'TRINIDAD');
INSERT INTO synonym(id, word, synonym)
VALUES (1680, 'TUFELLEH', 'TUFAYLI');
INSERT INTO synonym(id, word, synonym)
VALUES (1681, 'TUFHAILI', 'TUFAYLI');
INSERT INTO synonym(id, word, synonym)
VALUES (1690, 'TXANTON', 'JOSE ANTONIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1691, 'TXERU', 'CIELO');
INSERT INTO synonym(id, word, synonym)
VALUES (1692, 'TXOMIN', 'DOMINGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1694, 'UGUTZ', 'BAUTISTA');
INSERT INTO synonym(id, word, synonym)
VALUES (1711, 'UXIA', 'EUGENIA');
INSERT INTO synonym(id, word, synonym)
VALUES (1712, 'UXIO', 'EUGENIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1714, 'VALENTE', 'VALENTIN?ÿ');
INSERT INTO synonym(id, word, synonym)
VALUES (1716, 'VASQUES', 'VAZQUEZ');
INSERT INTO synonym(id, word, synonym)
VALUES (1718, 'VENCESLAO', 'WENCESLAO');
INSERT INTO synonym(id, word, synonym)
VALUES (1719, 'VENCESLAU', 'WENCESLAO');
INSERT INTO synonym(id, word, synonym)
VALUES (1720, 'VENEZIA', 'VENICE');
INSERT INTO synonym(id, word, synonym)
VALUES (1728, 'VICENC', 'VICENTE');
INSERT INTO synonym(id, word, synonym)
VALUES (1729, 'VICENT', 'VICENTE');
INSERT INTO synonym(id, word, synonym)
VALUES (1730, 'VICENZO', 'VICENTE');
INSERT INTO synonym(id, word, synonym)
VALUES (1731, 'VIRXILIO', 'VIRGILIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1750, 'XABAT', 'SALVADOR');
INSERT INTO synonym(id, word, synonym)
VALUES (1751, 'XABIER', 'JAVIER');
INSERT INTO synonym(id, word, synonym)
VALUES (1754, 'XACOBO', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1756, 'XALBADOR', 'SALVADOR');
INSERT INTO synonym(id, word, synonym)
VALUES (1758, 'XANTI', 'SANTIAGO');
INSERT INTO synonym(id, word, synonym)
VALUES (1759, 'XARLES', 'CARLOS');
INSERT INTO synonym(id, word, synonym)
VALUES (1761, 'XEFE', 'CEFERINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1768, 'XEROME', 'JERONIMO');
INSERT INTO synonym(id, word, synonym)
VALUES (1770, 'XERTRUDE', 'GERTRUDIS');
INSERT INTO synonym(id, word, synonym)
VALUES (1773, 'XIL', 'GUILLERMO');
INSERT INTO synonym(id, word, synonym)
VALUES (1774, 'XILBERTE', 'GILBERTO');
INSERT INTO synonym(id, word, synonym)
VALUES (1779, 'XIMUN', 'SIMON');
INSERT INTO synonym(id, word, synonym)
VALUES (1780, 'XOAN', 'JUAN');
INSERT INTO synonym(id, word, synonym)
VALUES (1792, 'XURXO', 'JORGE');
INSERT INTO synonym(id, word, synonym)
VALUES (1804, 'ZADORNIN', 'SATURNINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1807, 'ZEFERI', 'CEFERINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1808, 'ZELEDON', 'CELEDONIO');
INSERT INTO synonym(id, word, synonym)
VALUES (1809, 'ZERNIN', 'SATURNINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1810, 'ZERU', 'CIELO');
INSERT INTO synonym(id, word, synonym)
VALUES (1811, 'ZERUKO', 'CELESTINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1815, 'ZORION', 'FELIX');
INSERT INTO synonym(id, word, synonym)
VALUES (1816, 'ZUARA', 'ZUWARAH');
INSERT INTO synonym(id, word, synonym)
VALUES (1819, 'ZURI', 'BLANCO');
INSERT INTO synonym(id, word, synonym)
VALUES (1820, 'ZURIKO', 'ALBINO');
INSERT INTO synonym(id, word, synonym)
VALUES (1821, 'ZUZEN', 'JUSTO');
INSERT INTO synonym(id, word, synonym)
VALUES (1828, 'PIERRE', 'PEDRO');
INSERT INTO synonym(id, word, synonym)
VALUES (1829, 'PETER', 'PEDRO');


INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274150, 'PREDESCU', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274151, 'KATIMERTZGLOU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274152, 'SEFER', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274153, 'INVERSEGUR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274154, 'MOAHMED', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274155, 'ENCON', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274156, 'PIRAY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274157, 'NUREDDIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274158, 'ENCOF', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274159, 'SCHRECKENBERG', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274160, 'BAKHANA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274161, 'IOJA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274162, 'KIISKINEN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274163, 'ABDELJAMAL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274164, 'BAKHANE', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274165, 'ALLENDES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274166, 'ENERPLUS', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274167, 'TAUDIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274168, 'PIRAO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274169, 'MULTIPROVIHOGAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274170, 'HAGIU', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274171, 'HEGIRO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274172, 'AUTOELEC', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274173, 'WILLIAUME', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274174, 'GUINARODRI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274175, 'IOJI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274176, 'GUINDALAIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274177, 'COPROP', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274178, 'HOSEIN', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274179, 'RAMHAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274180, '3', NULL, NULL, 1335, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274181, 'OMAHONY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274182, 'BEROUAG', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274183, '2', NULL, NULL, 1819, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274184, '1', NULL, NULL, 1841, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274185, '0', NULL, NULL, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274186, '7', NULL, NULL, 616, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274187, '6', NULL, NULL, 763, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274188, 'GWENDA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274189, '5', NULL, NULL, 948, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274190, '4', NULL, NULL, 1103, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274191, '9', NULL, NULL, 447, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274192, '8', NULL, NULL, 606, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274193, 'IVASHKINA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274194, 'D', NULL, NULL, 844, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274195, 'E', NULL, NULL, 2004, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274196, 'IHASE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274197, 'F', NULL, NULL, 425, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274198, 'G', NULL, NULL, 457, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274199, 'A', NULL, NULL, 4464, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274200, 'B', NULL, NULL, 2780, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274201, 'C', NULL, NULL, 9598, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274202, 'TURBIO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274203, 'L', NULL, NULL, 14037, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274204, 'M', NULL, NULL, 1348, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274205, 'N', NULL, NULL, 1328, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274206, 'ISOGETRA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274207, 'ADOBE', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274208, 'O', NULL, NULL, 1076, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274209, 'H', NULL, NULL, 192, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274210, 'I', NULL, NULL, 871, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274211, 'J', NULL, NULL, 797, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274212, 'ATABALEROS', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274213, 'K', NULL, NULL, 53, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274214, 'TECNICOOL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274215, 'FYMES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274216, 'U', NULL, NULL, 1073, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274217, 'ZARZANA', NULL, NULL, 33, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274218, 'T', NULL, NULL, 564, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274219, 'W', NULL, NULL, 21, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274220, 'BALJUFER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274221, 'V', NULL, NULL, 352, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274222, 'Q', NULL, NULL, 18, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274223, 'SIRICIO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274224, 'ELEODORO', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274225, 'P', NULL, NULL, 2290, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274226, 'ALGARROBAS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274227, 'COMPIERCHIO', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274228, 'S', NULL, NULL, 18299, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274229, 'GUADALBULLON', NULL, NULL, 15, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274230, 'DODITA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274231, 'R', NULL, NULL, 640, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274232, 'NEVIDOMSKIS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274233, 'RANDONE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274234, 'Y', NULL, NULL, 12232, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274235, 'X', NULL, NULL, 39, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274236, 'ALGARROBAL', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274237, 'Z', NULL, NULL, 26, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274238, 'VERYSA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274239, 'ROTHSTEIN', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274240, 'JUVERLANDE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274241, 'ISMAELITA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274242, 'DARMANI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274243, 'NAYDENOV', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274244, 'MERITXELL', NULL, NULL, 37, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274245, 'STEPAROVA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274246, 'ZEINALOVA', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274247, 'BAKHALI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274248, 'CINETICA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274249, 'MORANCHEL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274250, 'SIKITRACO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274251, 'CASRRUBIOS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274252, 'SHERYL', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274253, 'BOLOTE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274254, 'ARTILLES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274255, 'ARROYOMIEL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274256, 'PROYECTOMAC', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274257, 'MELAUTO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274258, 'REFINANCIA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274259, 'AUTONOMO', NULL, NULL, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274260, 'TUDORITA', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274261, 'ELDBIORG', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274262, 'PIRFA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274263, 'PRADELLA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274264, 'HINOSTROSA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274265, 'ANTANAVICIUTE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274266, 'ALERJA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274267, 'RESIDENC', NULL, NULL, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274268, 'PRADELLI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274269, 'AUTONOMA', NULL, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274270, 'SOBERON', NULL, NULL, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274271, 'IVANICA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274272, 'PIRES', NULL, NULL, 80, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274273, 'HEMANTKUMAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274274, 'CRAPANZANO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274275, 'PIRET', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274276, 'JAQUIN', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274277, 'TECNOGAZUL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274278, 'BAKHARE', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274279, 'BENZAINOU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274280, 'PIREZ', NULL, NULL, 16, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274281, 'POIENAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274282, 'PERCEVAL', NULL, NULL, 15, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274283, 'GENICIO', NULL, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274284, 'ANYRO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274285, 'LUCARINI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274286, 'EPRAJA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274287, 'VALDEMANCO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274288, 'ORQUESTA', NULL, NULL, 22, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274289, 'ALGARROBIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274290, 'NUPAFRAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274291, 'ESCARLETT', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274292, 'GANADO', NULL, NULL, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274293, 'OBSERVATORIO', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274294, 'KISHIN', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274295, 'ABDELRHAFOR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274296, 'BALMAGAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274297, 'HERGARGU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274298, 'FELGAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274299, 'ARBERAS', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274300, 'HASNAT', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274301, 'GANADI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274302, 'BETIQUI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274303, 'JHASMYNE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274304, 'HASNAE', NULL, NULL, 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274305, 'MOVIFIAT', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274306, 'BOURZAMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274307, 'BOZZAO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274308, 'POPHAM', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274309, 'HASNAA', NULL, NULL, 16, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274310, 'MOLLEJAS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274311, 'IVANIEC', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274312, 'IOCO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274313, 'JOFREFIV', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274314, 'GYAMERA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274315, 'MAUZAUSSE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274316, 'ANTRIELEC', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274317, 'MARJOLA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274318, 'PIRCA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274319, 'CANBERO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274320, 'MOGUIMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274321, 'COINDEMAU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274322, 'MANJAVACA', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274323, 'BOURHOUFALA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274324, 'NAJIDI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274325, 'FACTORIA', NULL, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274326, 'ERBINO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274327, 'NAJIDA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274328, 'IREFON', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274329, 'DARMARY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274330, 'ANIDJAR', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274331, 'HAGOP', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274332, 'VILLARGORDO', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274333, 'ZSUZSANNA', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274334, 'RENDER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274335, 'STRINGFELOW', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274336, 'NEPALENSIS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274337, 'OTALORA', NULL, NULL, 59, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274338, 'NATHALEX', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274339, 'ANYOS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274340, 'KHATOON', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274341, 'BARHTA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274342, 'LIGHTOWLER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274343, 'GORROCHATEGUI', NULL, NULL, 20, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274344, 'VIORCA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274345, 'LONSER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274346, 'JICASE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274347, 'CHAKTIT', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274348, 'DROGODEP', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274349, 'RHARBAOUI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274350, 'SIMONETA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274351, 'DUNLOP', NULL, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274352, 'NOUKOUD', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274353, 'BOUFARS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274354, 'FATRIMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274355, 'IOURASSEN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274356, 'EFEVI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274357, 'BAAZIZ', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274358, 'CATLAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274359, 'SUBCOMU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274360, 'SEMUNINA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274361, 'HORATIU', NULL, NULL, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274362, 'TABIQUERIAS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274363, 'SCHIFF', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274364, 'HORATIO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274365, 'GRACIELAJOHANNA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274366, 'BENCHIBAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274367, 'HAGUE', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274368, 'VIOREL', NULL, NULL, 161, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274369, 'VIOREI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274370, 'VIDRASCU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274371, 'NATHALIA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274372, 'PIQUE', NULL, NULL, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274373, 'CARPIMAD', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274374, 'NATHALIE', NULL, NULL, 100, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274375, 'ARMITAGE', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274376, 'ROLLKES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274377, 'CARPIMAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274378, 'ENTREVOLCANES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274379, 'SEGURISAT', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274380, 'BECCALLI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274381, 'TENEZACA', NULL, NULL, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274382, 'LEGNER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274383, 'AJAGHFOUF', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274384, 'EMASUR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274385, 'CARPIMAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274386, 'VIANQUETI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274387, 'RAVONE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274388, 'MOTZKUHN', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274389, 'SADQUI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274390, 'ANYPE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274391, 'FATIASSI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274392, 'PERNANDEZ', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274393, 'NAJIMI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274394, 'VIEMANN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274395, 'WIKLUND', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274396, 'CAYADO', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274397, 'MANTENIM', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274398, 'GLIMELD', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274399, 'NAJIME', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274400, 'YADAMI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274401, 'IONE', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274402, 'JOHNPAUL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274403, 'NAJIMA', NULL, NULL, 19, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274404, 'JAVARES', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274405, 'FUENMIJAS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274406, 'IONA', NULL, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274407, 'VEGARA', NULL, NULL, 33, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274408, 'HATSIATHANASIOU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274409, 'UNDECIMO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274410, 'GREENAWAY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274411, 'ADOBES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274412, 'MICHERO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274413, 'PREETHIPA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274414, 'OGHENEWOEMU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274415, 'BOLOTA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274416, 'KAYBE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274417, 'MATHIASSEN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274418, 'UNDECIMA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274419, 'CAMPUSANO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274420, 'TORREGORDA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274421, 'ALERCE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274422, 'ANYJA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274423, 'BARHOM', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274424, 'CATTERICK', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274425, 'IONI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274426, 'NOORDERMEER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274427, 'YAMIAA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274428, 'STOPPA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274429, 'MANTENIA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274430, 'VILABOA', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274431, 'GAVEMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274432, 'HOVAGIMYAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274433, 'HINOSTROZA', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274434, 'CATLIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274435, 'BURNIKELL', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274436, 'HASNIA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274437, 'SCHIBA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274438, 'TAUSCHER', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274439, 'NOVOLOGOTO', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274440, 'KANOUTE', NULL, NULL, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274441, 'ZEINEDDIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274442, 'MCILROY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274443, 'SUIPEX', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274444, 'VISTALEGRE', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274445, 'FOSSATI', NULL, NULL, 51, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274446, 'IOLE', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274447, 'DECOLETAJE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274448, 'MEKHAIL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274449, 'FOSSATO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274450, 'TUDORINA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274451, 'SNOOK', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274452, 'PACO18', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274453, 'VILABOY', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274454, 'CSILA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274455, 'GAVELA', NULL, NULL, 9, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274456, 'ISAQUE', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274457, 'FOSSATY', NULL, NULL, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274458, 'CESMAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274459, 'NERKOWSKI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274460, 'FUHRKEN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274461, 'CESMAJ', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274462, 'RESTAURACIONES', NULL, NULL, 40, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274463, 'BAKTITOUS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274464, 'PRINDII', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274465, 'RANTANEN', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274466, 'GARFIELD', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274467, 'KAYAT', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274468, 'GENICOT', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274469, 'SCHICK', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274470, 'CARISMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274471, 'ELEUTERI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274472, 'CINTRANO', NULL, NULL, 138, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274473, 'SAGAMOSO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274474, 'PAYANHER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274475, 'KAYAK', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274476, 'CHARBATLI', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274477, 'ALGARROBOS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274478, 'BARDAHAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274479, 'GABRENEITE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274480, 'ESTESPORT', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274481, 'AICHMANN', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274482, 'CERVILLERA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274483, 'BOUMOUARETH', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274484, 'IDAIRA', NULL, NULL, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274485, 'AYEKANDE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274486, 'LAAMOURI', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274487, 'HERRUZO', NULL, NULL, 169, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274488, 'KENNAWAY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274489, 'LUDIVIA', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274490, 'VIGARAL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274491, 'LAKHSSASSI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274492, 'DJEORGEVITCH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274493, 'LOMBART', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274494, 'KEPEZINSKAS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274495, 'VIGARAY', NULL, NULL, 19, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274496, 'BARNANN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274497, 'ADORA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274498, 'YADARI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274499, 'TEZANOS', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274500, 'LOMBARD', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274501, 'YADARA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274502, 'GANAZA', NULL, NULL, 191, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274503, 'TECMAN', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274504, 'COMETALSUR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274505, 'LAVRINENCU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274506, 'QAMAR', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274507, 'VILLOREJO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274508, 'ADDARIO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274509, 'BERNALDER', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274510, 'BERNALDES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274511, 'ANIKED', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274512, 'THIRKETTLE', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274513, 'BERNALDEZ', NULL, NULL, 68, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274514, 'KAYNA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274515, 'QUARSHIE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274516, 'NWADIKE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274517, 'STANCIULESCU', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274518, 'ACHACHI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274519, 'KANBOUHI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274520, 'VOLKHART', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274521, 'KAPURTHALA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274522, 'ELEGANCE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274523, 'JIROSAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274524, 'WAANDERS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274525, 'RENDON', NULL, NULL, 1172, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274526, 'TIPANTAXI', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274527, 'MEHRDADIAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274528, 'SALCHARATRANS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274529, 'BADRUDIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274530, 'DIEUWKE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274531, 'YSEDDIK', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274532, 'PELONCETE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274533, 'VOLKHARD', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274534, 'QAMCH', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274535, 'ERRAHMOUNI', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274536, 'SEERY', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274537, 'YODALY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274538, 'STASKUS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274539, 'ADOSE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274540, 'MICHEIL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274541, 'IOVU', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274542, 'BENEDITO', NULL, NULL, 28, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274543, 'KOSSOBOKOVA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274544, 'COMPUMAIL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274545, 'ADOMA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274546, 'KAYLA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274547, 'ADONA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274548, 'DONOGHUE', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274549, 'BENEDITA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274550, 'HEPATICOS', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274551, 'INGVAR', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274552, 'BROQUETAS', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274553, 'EXOPOSITO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274554, 'KAYLE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274555, 'BOLPLA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274556, 'ENDER', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274557, 'ESPITALLIER', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274558, 'UKATO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274559, 'ARCOELVIRA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274560, 'PALOMRES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274561, 'LOMBANA', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274562, 'ALFAMAR', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274563, 'MATUSOIU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274564, 'SEEPE', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274565, 'ROSARIA', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274566, 'JULBEZ', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274567, 'ADOLF', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274568, 'MIODRAG', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274569, 'IDOYAGA', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274570, 'BARNARD', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274571, 'NEGREIRA', NULL, NULL, 70, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274572, 'JULBES', NULL, NULL, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274573, 'BIDDULPH', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274574, 'IOVA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274575, 'QAMER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274576, 'SOCUPLACA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274577, 'ECHEVESTE', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274578, 'IOVE', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274579, 'TUDORICA', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274580, 'VIOQUE', NULL, NULL, 76, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274581, 'ALMANZARA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274582, 'NEGREIRO', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274583, 'KOMBAROVA', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274584, 'PENELEPE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274585, 'HALUSHKA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274586, 'BOJAWAL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274587, 'SARAHYT', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274588, 'SEEMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274589, 'MEDITERRANEUM', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274590, 'OUKACHA', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274591, 'RDORIGUEZ', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274592, 'EFFAH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274593, 'FRASSANITO', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274594, 'BARBOVITCH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274595, 'MICHELE', NULL, NULL, 107, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274596, 'CZARNY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274597, 'TELWAY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274598, 'KASTANJE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274599, 'ROSARIO', NULL, NULL, 22486, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274600, 'MICHELA', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274601, 'MICHELL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274602, 'CANDEIRAS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274603, 'VERYHA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274604, 'MICHELI', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274605, 'SHAHLAE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274606, 'ABDALKADER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274607, 'IOSU', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274608, 'MICHELS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274609, 'MESFIOUI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274610, 'HIFERROCAS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274611, 'SAMAOUI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274612, 'GANATE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274613, 'MURLIDHAR', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274614, 'ESPADENTAL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274615, 'HRADOBOYEV', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274616, 'KLALOUSSI', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274617, 'ADONY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274618, 'CARPATINA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274619, 'WISSINK', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274620, 'ESTANCOVICH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274621, 'CHUMBLEY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274622, 'WISSING', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274623, 'YAMINA', NULL, NULL, 228, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274624, 'UNIWIRELESS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274625, 'ALMUEDO', NULL, NULL, 35, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274626, 'TESOALPA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274627, 'NAJIBA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274628, 'TLIMES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274629, 'NILOLAY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274630, 'DISCOVERYMIND', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274631, 'NAJIBI', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274632, 'PANICHKINA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274633, 'ANIKKI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274634, 'SUQUIA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274635, 'NOTZOLD', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274636, 'VIGARIO', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274637, 'WHITEOAK', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274638, 'SIGBRITT', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274639, 'TAYRONA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274640, 'CALDEIRA', NULL, NULL, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274641, 'PALLARUELO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274642, 'ANZAR', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274643, 'CALIMAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274644, 'NOTLEY', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274645, 'ROMANYSHYN', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274646, 'ENTERPRISE', NULL, NULL, 17, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274647, 'VAIKUNTHA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274648, 'AMKECHRD', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274649, 'BRAUNSCHWEIG', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274650, 'CARISUZ', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274651, 'ROMPESERONES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274652, 'MATYAS', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274653, 'DIJKXHOORN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274654, 'CHIBUZOR', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274655, 'ZAGREBELNY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274656, 'CALDEIRO', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274657, 'BOUDCHAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274658, 'NATHALIER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274659, 'SARISSO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274660, 'YAMILE', NULL, NULL, 17, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274661, 'ZULUAGA', NULL, NULL, 28, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274662, 'SAVITSKAYA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274663, 'MOJLUF', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274664, 'YAMILA', NULL, NULL, 99, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274665, 'HORIZON', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274666, 'ARTICARDI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274667, 'GANANA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274668, 'CROHON', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274669, 'PIERNAS', NULL, NULL, 50, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274670, 'RESINNOV', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274671, 'EFFEY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274672, 'PETRYCHUK', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274673, 'AHLIOUA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274674, 'GUILERA', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274675, 'ELYSABETH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274676, 'APOLONIA', NULL, NULL, 185, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274677, 'LALESKA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274678, 'CANTALACHINA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274679, 'ESTRUCTURAS', NULL, NULL, 446, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274680, 'SIRIRONTE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274681, 'IPAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274682, 'DOLUKA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274683, 'IPAF', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274684, 'KHATOURI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274685, 'SUCESO', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274686, 'XUEFENG', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274687, 'APOLONIO', NULL, NULL, 81, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274688, 'BAKHACH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274689, 'SUCESS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274690, 'AHMIMOUD', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274691, 'ALERTA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274692, 'LONAROQUE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274693, 'DIBRAPEL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274694, 'LEVENKO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274695, 'SARROUKK', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274696, 'FRUCTO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274697, 'COLECTIVO', NULL, NULL, 28, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274698, 'SARROUKH', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274699, 'MOLENBERGHS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274700, 'BENEDIKT', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274701, 'RYBALKA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274702, 'KAYTA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274703, 'YAMIRA', NULL, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274704, 'LAASSAOUI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274705, 'EVOLE', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274706, 'BRODSGAARD', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274707, 'KAYTE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274708, 'MOSKVITIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274709, 'MEDITERRANEOS', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274710, 'GJERLUF', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274711, 'FURTUTO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274712, 'ALERSI', NULL, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274713, 'MICHEAL', NULL, NULL, 12, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274714, 'NOASOL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274715, 'CODALGO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274716, 'IZZAT', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274717, 'ORKISZ', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274718, 'ADODO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274719, 'OULOUAL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274720, 'IZZAK', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274721, 'COLECTIVA', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274722, 'LIOBANI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274723, 'VALDECASA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274724, 'DOMNICA', NULL, NULL, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274725, 'SUQUET', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274726, 'RYBALKO', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274727, 'VEGABO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274728, 'CARBELLIDO', NULL, NULL, 49, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274729, 'KISIEL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274730, 'ANIKIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274731, 'BOUSERHAM', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274732, 'SNOWBALL', NULL, NULL, 8, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274733, 'KAYRA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274734, 'INDIVIDUAL', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274735, 'PAULSSON', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274736, 'BUXDIZ', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274737, 'KAMSTRA', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274738, 'AMOEDO', NULL, NULL, 21, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274739, 'TABAIBA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274740, 'QIAOHONG', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274741, 'NVARRO', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274742, 'MIGNOLLI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274743, 'GROSLIPE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274744, 'RIESGOS', NULL, NULL, 19, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274745, 'PITITTO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274746, 'PIBASA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274747, 'ALUPER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274748, 'EMPINADA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274749, 'NOVACOVICCI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274750, 'ACEITUNEROS', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274751, 'BANDIOUGOU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274752, 'SIGHARTAU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274753, 'STRATFORD', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274754, 'CASHWARE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274755, 'LANDAVERI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274756, 'PETKUTE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274757, 'MAJANCSIK', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274758, 'LAMUNO', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274759, 'BELHAUSSINE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274760, 'FALAGAN', NULL, NULL, 13, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274761, 'PACOAL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274762, 'URILDAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274763, 'INMEVED', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274764, 'SIMAGOBEL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274765, 'RICARDONES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274766, 'FERRIOH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274767, 'COSLADA', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274768, 'ZEESHAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274769, 'GAMBARTE', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274770, 'FERRIOL', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274771, 'GAMBORINO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274772, 'HAJAFA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274773, 'EFIMOV', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274774, 'BERESFORD', NULL, NULL, 10, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274775, 'TORRELUZ', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274776, 'WISNIAKOWSKI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274777, 'RURALGAMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274778, 'CACILIE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274779, 'GRISHIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274780, 'WESSMAN', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274781, 'PISAN', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274782, 'CACILIA', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274783, 'BENDRISS', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274784, 'CODISAMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274785, 'PISAS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274786, 'CARITAS', NULL, NULL, 23, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274787, 'SEMILIU', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274788, 'TRAIGOBICH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274789, 'RHOLAM', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274790, 'ALUPRI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274791, 'COMONTESA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274792, 'ABDESLLEM', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274793, 'NARIMANE', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274794, 'NAVEGACION', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274795, 'HAFIZ', NULL, NULL, 7, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274796, 'GRANKVIST', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274797, 'ANDALIA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274798, 'XIANSHENG', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274799, 'KUMZIENE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274800, 'BUSTURIA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274801, 'LAKCHMI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274802, 'ARTEMOBEL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274803, 'FERGUNZON', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274804, 'HAFID', NULL, NULL, 73, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274805, 'COSLADO', NULL, NULL, 30, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274806, 'LANAGRAN', NULL, NULL, 15, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274807, 'TURCIN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274808, 'HELAINE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274809, 'THRING', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274810, 'FAREROSA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274811, 'ANAEGBUE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274812, 'VUMAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274813, 'PISCI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274814, 'VILLARRUEL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274815, 'BECONIS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274816, 'ZORZAL', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274817, 'DONNELLY', NULL, NULL, 18, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274818, 'GRANVIA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274819, 'PISCO', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274820, 'BOOGAARD', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274821, 'FERRINA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274822, 'RAMIBA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274823, 'ARGHYRO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274824, 'DIGNIDAD', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274825, 'MILCAPRO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274826, 'GRANVIK', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274827, 'TOUABAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274828, 'VINACHEZ', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274829, 'AYITEY', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274830, 'XANIA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274831, 'SARAIMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274832, 'VARDANYAN', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274833, 'HUSMANN', NULL, NULL, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274834, 'NOARBE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274835, 'GELING', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274836, 'GUEORGUI', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274837, 'HEUPNER', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274838, 'ALAVENORA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274839, 'ENDRE', NULL, NULL, 4, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274840, 'GUADAHORNILLOS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274841, '000756394L', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274842, 'SCOLPATTI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274843, 'SEGAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274844, 'ENCHEV', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274845, 'KATOVICH', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274846, 'LENQUETTE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274847, 'SEGAL', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274848, 'PACERGON', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274849, 'HIDIVAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274850, 'ASPLAN', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274851, 'SEGAZ', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274852, 'AHSAINE', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274853, 'JENSES', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274854, 'JENSEN', NULL, NULL, 150, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274855, 'JENSEM', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274856, 'AHSAINI', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274857, 'GONNZALEZ', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274858, 'KDAHI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274859, 'MASSOCCO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274860, 'ILUSTRACION', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274861, 'AFLITTO', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274862, 'GAMBONI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274863, 'PERAGALLO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274864, 'ENCHEF', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274865, 'JOACHUM', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274866, 'GOFERMA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274867, 'LABRANDERO', NULL, NULL, 14, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274868, 'PECAFAMI', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274869, 'AINAGA', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274870, 'VINACHES', NULL, NULL, 2, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274871, 'RAMIAR', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274872, 'SARAIKA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274873, 'BENNARDO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274874, 'GAMBOLO', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274875, 'ELKHANNOUS', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274876, 'BINFIELD', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274877, 'SAMANDA', NULL, NULL, 6, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274878, 'TORRODOSMASTRES', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274879, 'FERANNDEZ', NULL, NULL, 11, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274880, 'FERRITZ', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274881, 'SAMANES', NULL, NULL, 5, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274882, 'HASMAC', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO word(id, word, original_source, entry_date, num_times_found, first_name_freq, last_name_freq, company_freq,
other_freq, male_freq, female_freq, bl_freq, wl_freq)
VALUES (274883, 'SEMILLA', NULL, NULL, 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);



