import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentDeleted, onDocumentWritten, Change, FirestoreEvent } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { SpeechClient } from "@google-cloud/speech";
import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { initializeApp } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { v4 as uuidv4 } from 'uuid';
import {
  getFirestore,
  Timestamp,
  DocumentSnapshot,
  FieldValue,
} from "firebase-admin/firestore";

interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  subscription: SubscriptionStatus;
  usage?: UsageData;
  isAdmin?: boolean;
  stripeId?: string;
  stripeRole?: string;
  // Usage data specific to classroom members, stored on the TEACHER's user document
  classroomUsage?: {
    teacher?: UsageData;
    students?: {
      [studentUid: string]: UsageData;
    };
  };
  preferences?: {
     voice?: string;
     speakingRate?: number;
     storyLength?: number;
  };
  createdAt?: any;
  memberOfClassroom?: string | null; // <-- ADD THIS FIELD (teacher's UID or null)
}

type SubscriptionStatus = "free" | "lite" | "max" | "inactive" | "admin" | "classroom";

interface UsageData {
  credits: number;
  lastReset: number; // Timestamp
}

// Initialize the Admin SDK
initializeApp();
const bucket = getStorage().bucket();

const adminDb = getFirestore();

const speechClient = new SpeechClient();
const textToSpeechClient = new TextToSpeechClient();

const STORY_LENGTH_MAP = [
    "2-4 sentences",    // Short
    "6-8 sentences",    // Medium
    "12-16 sentences",  // Long
    "24-32 sentences"   // Epic
];

const nameSuggestions = {
    A: ["Aaron", "Abby", "Abigail", "Abraham", "Ada", "Adam", "Adalyn", "Addison", "Adeline", "Adrian", "Adriana", "Aiden", "Aisha", "Alaina", "Alan", "Albert", "Alden", "Alejandro", "Alex", "Alexa", "Alexander", "Alexandra", "Alexis", "Alice", "Alicia", "Alina", "Allison", "Alma", "Alvin", "Alyssa", "Amara", "Amari", "Amelia", "Amir", "Amy", "Ana", "Anastasia", "Anderson", "Andre", "Andrea", "Andrew", "Angel", "Angela", "Angelina", "Angus", "Anita", "Ann", "Anna", "Annabelle", "Anthony", "Apollo", "April", "Archer", "Archie", "Aria", "Ariana", "Ariel", "Arthur", "Arturo", "Arya", "Asa", "Asher", "Ashley", "Aspen", "Astrid", "Athena", "Atlas", "Aubrey", "Audrey", "August", "Aurora", "Austin", "Autumn", "Ava", "Avery", "Axel"],
    B: ["Bailey", "Barbara", "Barrett", "Barry", "Bartholomew", "Baxter", "Beatrice", "Beau", "Beckett", "Bella", "Ben", "Benedict", "Benjamin", "Bennett", "Benson", "Bethany", "Betty", "Bianca", "Bill", "Billy", "Blaine", "Blair", "Blake", "Blaze", "Blossom", "Bo", "Bobby", "Bodhi", "Bonnie", "Boris", "Bowen", "Brad", "Bradley", "Brady", "Brandon", "Brantley", "Brenda", "Brendan", "Brennan", "Brent", "Brett", "Brian", "Briar", "Brianna", "Bridget", "Brielle", "Brock", "Brody", "Brooke", "Brooklyn", "Brooks", "Bruce", "Bruno", "Bryan", "Bryce", "Brynn", "Byron"],
    C: ["Caleb", "Callie", "Callum", "Calvin", "Cameron", "Camila", "Camille", "Campbell", "Cara", "Carl", "Carla", "Carlos", "Carmen", "Carol", "Caroline", "Carolyn", "Carson", "Carter", "Casey", "Cassandra", "Cassidy", "Cassie", "Cassius", "Catalina", "Catherine", "Cecelia", "Cecilia", "Cedar", "Celeste", "Celia", "Chad", "Chance", "Chandler", "Charles", "Charlie", "Charlotte", "Chase", "Chelsea", "Cherry", "Chester", "Chloe", "Chris", "Christian", "Christina", "Christopher", "Cindy", "Claire", "Clara", "Clarence", "Clark", "Clay", "Clayton", "Clementine", "Clifford", "Clint", "Clive", "Clover", "Cody", "Cohen", "Colby", "Cole", "Colette", "Colin", "Colleen", "Collin", "Colt", "Colton", "Conan", "Conner", "Connor", "Conrad", "Constance", "Cooper", "Cora", "Coralie", "Corbin", "Corey", "Craig", "Cristian", "Cruz", "Crystal", "Cynthia", "Cyrus"],
    D: ["Daisy", "Dakota", "Dale", "Dallas", "Dalton", "Damian", "Damien", "Damon", "Dan", "Dana", "Daniel", "Daniela", "Danielle", "Danny", "Dante", "Daphne", "Darcy", "Daria", "Darius", "Darren", "Darryl", "Darwin", "Dave", "David", "Davis", "Dawn", "Dawson", "Dean", "Deanna", "Deborah", "Declan", "Delilah", "Dennis", "Derek", "Desmond", "Destiny", "Devin", "Devon", "Dexter", "Diana", "Diego", "Dillon", "Dimitri", "Dina", "Dolly", "Dominic", "Dominique", "Don", "Donald", "Donna", "Donovan", "Dora", "Dorian", "Dorothy", "Doug", "Douglas", "Drake", "Drew", "Duke", "Dustin", "Dwayne", "Dwight", "Dylan"],
    E: ["Earl", "Easton", "Ed", "Eddie", "Eden", "Edgar", "Edison", "Edith", "Edmund", "Edna", "Edward", "Edwin", "Eileen", "Elaina", "Elaine", "Eleanor", "Elena", "Eli", "Eliana", "Elias", "Elijah", "Elisa", "Elise", "Eliza", "Elizabeth", "Ella", "Ellery", "Ellie", "Elliot", "Elliott", "Ellis", "Eloise", "Elsa", "Elsie", "Elwood", "Ember", "Emerson", "Emery", "Emil", "Emilia", "Emiliano", "Emily", "Emma", "Emmanuel", "Emmett", "Enzo", "Eric", "Erica", "Erick", "Erik", "Erin", "Ernest", "Ernesto", "Esme", "Esmeralda", "Esteban", "Estelle", "Esther", "Ethan", "Eugene", "Eva", "Evan", "Evangeline", "Eve", "Evelyn", "Everett", "Everly", "Ezekiel", "Ezra"],
    F: ["Fabian", "Faith", "Farah", "Fatima", "Faye", "Felix", "Fern", "Fernando", "Fiona", "Finn", "Finley", "Finnian", "Finnegan", "Fletcher", "Flora", "Florence", "Floyd", "Flynn", "Forrest", "Foster", "Fox", "Frances", "Francesca", "Francis", "Francisco", "Frank", "Frankie", "Franklin", "Fraser", "Fred", "Freddy", "Frederick", "Freya"],
    G: ["Gabby", "Gabriel", "Gabriela", "Gabriella", "Gael", "Gage", "Gale", "Galen", "Garrett", "Gary", "Gavin", "Gemma", "Gene", "Genesis", "Genevieve", "George", "Georgia", "Gerald", "Gerard", "Gerry", "Gianna", "Gideon", "Gigi", "Gilbert", "Gilda", "Gina", "Ginger", "Ginny", "Giovanni", "Giselle", "Gladys", "Glen", "Glenn", "Gloria", "Goldie", "Gordon", "Grace", "Gracie", "Grady", "Graham", "Grant", "Grayson", "Greg", "Gregg", "Gregory", "Greta", "Gretchen", "Griffin", "Guadalupe", "Gus", "Gustavo", "Guy", "Gwen", "Gwendolyn"],
    H: ["Hadley", "Hailey", "Hal", "Haley", "Hamish", "Hank", "Hannah", "Hans", "Harley", "Harmony", "Harold", "Harper", "Harriet", "Harrison", "Harry", "Harvey", "Hattie", "Haven", "Hayden", "Hazel", "Heath", "Heather", "Hector", "Heidi", "Helen", "Helena", "Hendrix", "Henry", "Herbert", "Herman", "Hilda", "Hollis", "Holly", "Hope", "Horace", "Howard", "Hudson", "Hugh", "Hugo", "Hunter"],
    I: ["Ian", "Ibrahim", "Ida", "Idris", "Ignatius", "Igor", "Ilana", "Ilia", "Imani", "Imogen", "Indie", "Indigo", "Indira", "Ingrid", "Ira", "Irene", "Iris", "Irvin", "Irving", "Isaac", "Isabel", "Isabella", "Isaiah", "Isidora", "Isla", "Israel", "Ivan", "Ivana", "Ives", "Ivy", "Izzy"],
    J: ["Jack", "Jackson", "Jacob", "Jacqueline", "Jade", "Jaden", "Jake", "Jakob", "James", "Jameson", "Jamie", "Jane", "Janelle", "Janet", "Janice", "Jared", "Jarvis", "Jasmine", "Jason", "Jasper", "Javier", "Jay", "Jayce", "Jayden", "Jayla", "Jean", "Jedidiah", "Jeff", "Jefferson", "Jeffrey", "Jenna", "Jennifer", "Jensen", "Jeremiah", "Jeremy", "Jerome", "Jerry", "Jesse", "Jessica", "Jesus", "Jet", "Jett", "Jill", "Jillian", "Jim", "Jimmy", "Jo", "Joan", "Joanna", "Joanne", "Joaquin", "Jocelyn", "Joe", "Joel", "Joelle", "Joey", "Johan", "John", "Johnathan", "Johnny", "Jolene", "Jon", "Jonah", "Jonas", "Jonathan", "Jones", "Jordan", "Jordyn", "Jorge", "Jose", "Joseph", "Josephine", "Josh", "Joshua", "Josiah", "Josie", "Joy", "Joyce", "Juan", "Juana", "Judah", "Judd", "Jude", "Judith", "Judy", "Jules", "Julia", "Julian", "Juliana", "Julie", "Juliet", "Julio", "Julius", "June", "Juniper", "Justin", "Justine"],
    K: ["Kai", "Kaiser", "Kaleb", "Kali", "Kamala", "Kamden", "Kara", "Karen", "Karina", "Karl", "Karla", "Kate", "Katelyn", "Katherine", "Kathleen", "Kathy", "Katie", "Katrina", "Kay", "Kaya", "Kayden", "Kayla", "Keanu", "Keaton", "Keegan", "Keira", "Keith", "Kellan", "Kelly", "Kelsey", "Kelvin", "Ken", "Kendall", "Kendra", "Kendrick", "Kenji", "Kenna", "Kenneth", "Kenny", "Kent", "Kenzie", "Kevin", "Khalid", "Khalil", "Kiara", "Kieran", "Kim", "Kimberly", "King", "Kingsley", "Kingston", "Kinley", "Kinsley", "Kip", "Kira", "Kirby", "Kirk", "Kit", "Knox", "Kobe", "Kody", "Kolton", "Kris", "Krista", "Kristen", "Kristin", "Kristina", "Kristoff", "Kristopher", "Kurt", "Kurtis", "Kyle", "Kyler", "Kyra", "Kyrie"],
    L: ["Lacey", "Lachlan", "Laila", "Lana", "Lance", "Landon", "Lane", "Langston", "Larry", "Laura", "Laurel", "Lauren", "Laurence", "Lawrence", "Layla", "Lea", "Leah", "Leander", "Leandro", "Lee", "Leif", "Leila", "Leilani", "Lena", "Lennon", "Lennox", "Leo", "Leon", "Leona", "Leonard", "Leonardo", "Leonie", "Leopold", "Leroy", "Leslie", "Levi", "Lewis", "Lex", "Lexi", "Lia", "Liam", "Liana", "Libby", "Liberty", "Lila", "Lilac", "Lilah", "Lilian", "Liliana", "Lilith", "Lily", "Lincoln", "Linda", "Lindsay", "Linus", "Lionel", "Lisa", "Liv", "Livia", "Liz", "Liza", "Lizzy", "Lloyd", "Logan", "Lois", "Lola", "London", "Lonnie", "Loren", "Lorena", "Lorenzo", "Lori", "Lorna", "Lorraine", "Lou", "Louie", "Louis", "Louisa", "Louise", "Luca", "Lucas", "Lucia", "Lucian", "Luciano", "Lucille", "Lucy", "Luis", "Luka", "Luke", "Luna", "Luz", "Lydia", "Lyle", "Lynda", "Lynn", "Lyra", "Lyric"],
    M: ["Mabel", "Mabelle", "Mac", "Mack", "Mackenzie", "Macy", "Maddox", "Madeleine", "Madeline", "Madelyn", "Madison", "Mae", "Maeve", "Maggie", "Magnolia", "Magnus", "Maia", "Maisie", "Makai", "Makayla", "Malachi", "Malcolm", "Malia", "Mallory", "Mandy", "Manuel", "Maple", "Mara", "Marc", "Marcel", "Marcella", "Marcia", "Marco", "Marcos", "Marcus", "Marcy", "Margaret", "Margo", "Maria", "Mariah", "Mariana", "Marianne", "Marie", "Marilyn", "Marina", "Mario", "Marion", "Marisa", "Marjorie", "Mark", "Marla", "Marlene", "Marley", "Marlon", "Marnie", "Marsha", "Marshall", "Martha", "Martin", "Martina", "Marty", "Marvin", "Mary", "Maryam", "Mason", "Mat", "Mateo", "Mathew", "Mathilda", "Matilda", "Matt", "Matthew", "Matthias", "Maude", "Maureen", "Maurice", "Maverick", "Max", "Maxim", "Maximilian", "Maximus", "Maxwell", "Maya", "Mazie", "Megan", "Melanie", "Melinda", "Melissa", "Melody", "Melvin", "Mercedes", "Meredith", "Micah", "Michael", "Michaela", "Michelle", "Mickey", "Miguel", "Mikaela", "Mike", "Mila", "Milan", "Mildred", "Miles", "Miller", "Millie", "Milo", "Milton", "Mina", "Mindy", "Mira", "Mirabel", "Miranda", "Miriam", "Misha", "Misty", "Mitch", "Mitchell", "Mitzi", "Molly", "Mona", "Monica", "Monique", "Monroe", "Montgomery", "Morgan", "Morris", "Moses", "Muhammad", "Murphy", "Murray", "Myles", "Myra", "Myron"],
    N: ["Nadia", "Nadine", "Nancy", "Naomi", "Nash", "Nasir", "Nat", "Natalia", "Natalie", "Natasha", "Nate", "Nathan", "Nathaniel", "Neal", "Ned", "Nehemiah", "Neil", "Nell", "Nellie", "Nelson", "Neville", "Nia", "Nicholas", "Nick", "Nico", "Nicola", "Nicole", "Nigel", "Niko", "Nikolai", "Nila", "Nina", "Nixon", "Noah", "Noe", "Noel", "Noelle", "Nola", "Nolan", "Nora", "Norah", "Norma", "Norman", "Nova", "Nyla"],
    O: ["Oakley", "Odin", "Olive", "Oliver", "Olivia", "Ollie", "Omar", "Opal", "Ophelia", "Orion", "Orlando", "Orson", "Oscar", "Osiris", "Oslo", "Osman", "Otis", "Otto", "Owen", "Ozzy"],
    P: ["Pablo", "Paige", "Paisley", "Palmer", "Paloma", "Pam", "Pamela", "Paola", "Paris", "Parker", "Pat", "Patricia", "Patrick", "Patsy", "Patti", "Patty", "Paul", "Paula", "Paulina", "Pauline", "Paxton", "Payton", "Pearl", "Pedro", "Peggy", "Penelope", "Penny", "Percy", "Perry", "Pete", "Peter", "Petra", "Peyton", "Phil", "Philip", "Phillip", "Phoebe", "Phoenix", "Phyllis", "Pierce", "Pierre", "Piper", "Pip", "Pippa", "Poppy", "Porter", "Preston", "Prince", "Princess", "Priscilla", "Prudence"],
    Q: ["Quentin", "Quincy", "Quinn", "Quintus"],
    R: ["Rachel", "Rafael", "Raiden", "Ralph", "Ramon", "Ramona", "Randall", "Randy", "Raphael", "Raquel", "Raul", "Raven", "Ray", "Raymond", "Reagan", "Rebecca", "Rebekah", "Reed", "Reese", "Reggie", "Regina", "Reginald", "Reid", "Remi", "Remington", "Remy", "Renata", "Rene", "Renee", "Reuben", "Rex", "Rey", "Reyna", "Rhea", "Rhett", "Rhiannon", "Rhonda", "Rhys", "Ricardo", "Richard", "Rick", "Ricky", "Ridge", "Riley", "Rita", "River", "Rob", "Robbie", "Robert", "Roberta", "Roberto", "Robin", "Rocco", "Rocky", "Rod", "Rodney", "Rodrigo", "Roger", "Rohan", "Roland", "Roman", "Romeo", "Ron", "Ronald", "Ronan", "Ronnie", "Rory", "Rosa", "Rosalie", "Rosalind", "Rosalyn", "Rose", "Rosemary", "Rosie", "Ross", "Rowan", "Rowena", "Roxanne", "Roy", "Royal", "Royce", "Ruben", "Ruby", "Rudy", "Rupert", "Russ", "Russell", "Ruth", "Ryan", "Ryder", "Rylan", "Ryland"],
    S: ["Sabrina", "Sadie", "Sage", "Sahara", "Sal", "Salem", "Sally", "Salvador", "Salvatore", "Sam", "Samantha", "Samir", "Samson", "Samuel", "Sandra", "Sandy", "Santiago", "Santos", "Saoirse", "Sapphire", "Sara", "Sarah", "Sarai", "Sasha", "Saul", "Savannah", "Sawyer", "Scarlett", "Scott", "Scout", "Sean", "Sebastian", "Selena", "Selene", "Selma", "Seraphina", "Serena", "Sergio", "Seth", "Shane", "Shania", "Shannon", "Sharon", "Shaun", "Shawn", "Shawna", "Shayla", "Shea", "Sheila", "Shelby", "Sheldon", "Shelley", "Sherlock", "Sherman", "Sherry", "Shirley", "Sid", "Sidney", "Sienna", "Sierra", "Sigrid", "Silas", "Silvia", "Simeon", "Simon", "Simone", "Skye", "Skylar", "Skyler", "Sloan", "Sofia", "Sol", "Solomon", "Sondra", "Sonia", "Sonny", "Sonya", "Sophia", "Sophie", "Spencer", "Stacey", "Stacy", "Stan", "Stanley", "Star", "Stefan", "Stefanie", "Stella", "Steph", "Stephan", "Stephanie", "Stephen", "Sterling", "Steve", "Steven", "Stevie", "Stewart", "Storm", "Stuart", "Sue", "Sullivan", "Summer", "Sunny", "Susan", "Susanna", "Susie", "Suzanne", "Sybil", "Sydney", "Sylvester", "Sylvia", "Sylvie"],
    T: ["Tabitha", "Talia", "Tamara", "Tammy", "Tanner", "Tanya", "Tara", "Tasha", "Tate", "Tatiana", "Tatum", "Taylor", "Teagan", "Ted", "Teddy", "Teresa", "Terrance", "Terrell", "Terrence", "Terry", "Tess", "Tessa", "Thad", "Thalia", "Thea", "Theo", "Theodora", "Theodore", "Theresa", "Thomas", "Tia", "Tiana", "Tiffany", "Tilda", "Tilly", "Tim", "Timothy", "Tina", "Titan", "Titus", "Tobias", "Toby", "Todd", "Tom", "Tommy", "Tony", "Tori", "Tracey", "Tracy", "Travis", "Trent", "Trenton", "Trevor", "Trey", "Trinity", "Trip", "Tristan", "Tristen", "Troy", "Trudy", "Tucker", "Tyler", "Tyrone", "Tyson"],
    U: ["Ulysses", "Uma", "Uriah", "Ursula"],
    V: ["Val", "Valentina", "Valentin", "Valentino", "Valeria", "Valerie", "Van", "Vance", "Vanessa", "Vaughn", "Veda", "Vera", "Vern", "Vernon", "Veronica", "Vic", "Vicky", "Victor", "Victoria", "Vida", "Vienna", "Vikram", "Vince", "Vincent", "Vincenzo", "Viola", "Violet", "Virgil", "Virginia", "Vivian", "Viviana", "Vivienne", "Vladimir"],
    W: ["Wade", "Walker", "Wallace", "Wally", "Walt", "Walter", "Wanda", "Ward", "Warren", "Waylon", "Wayne", "Wendy", "Wesley", "Westley", "Weston", "Whitney", "Will", "Willa", "William", "Willie", "Willow", "Wilma", "Wilson", "Winifred", "Winnie", "Winston", "Winter", "Woody", "Wren", "Wyatt"],
    X: ["Xander", "Xavier", "Xena", "Xyla"],
    Y: ["Yara", "Yasmin", "Yates", "Yehuda", "Yelena", "Yesenia", "Yvette", "Yvonne", "Yusuf"],
    Z: ["Zachariah", "Zachary", "Zach", "Zack", "Zahir", "Zander", "Zane", "Zara", "Zaria", "Zayn", "Zayne", "Zebediah", "Zed", "Zeke", "Zelda", "Zella", "Zia", "Zion", "Zoe", "Zoey", "Zola", "Zuri"]
};

const getStoryAndPromptSystemInstruction = (storyLength: number): string => {
    const sentenceCount = STORY_LENGTH_MAP[storyLength] || STORY_LENGTH_MAP[0];
    // --- ADDED: Convert name object to string for the prompt ---
    const nameListString = JSON.stringify(nameSuggestions);

    return `You are a creative storyteller and an expert in writing prompts for image generation models.
      Based on the user's topic, you will generate four things in a single JSON object:
      1.  A creative and short title for the story.
      2.  A simple, and positive story of about ${sentenceCount} for a young child that is directly about the user's topic.
          - FORBIDDEN THEMES: violence, death, scary monsters, sadness, complex topics.
          - Focus on friendship, animals, nature, and joy.
          - Do not use complex words or sentence structures.
          - **IMPORTANT**: When naming characters, please try to use names from the following list if appropriate, for variety: ${nameListString}. Use a random name for the characters, but also you can alliterate names to the type of character i.e. Brad the Bear, Derek the Deer, etc.
      3.  A very descriptive and detailed prompt for a colorful, simple, and friendly cartoon illustration that visually represents the story.
          - The style should be like a children's book illustration, with soft edges and a happy mood.
          - Crucially, the prompt must include the main characters, the setting, and the key objects or actions mentioned in the story text.
          - Do not include any of the original text from the story in your prompt. Focus only on describing the visual scene.
      4.  A short quiz with 3 multiple-choice questions based on the story, suitable for K-3 students and grounded in Bloom's Taxonomy. Each question should have a "question" text, an array of "options", and the "answer".

      Your response MUST be a valid JSON object with the following structure:
      {
        "title": "...",
        "story": "...",
        "imagePrompt": "...",
        "quiz": [
          { "question": "...", "options": ["...", "...", "..."], "answer": "..." },
          { "question": "...", "options": ["...", "...", "..."], "answer": "..." },
          { "question": "...", "options": ["...", "...", "..."], "answer": "..." }
        ]
      }`;
};

const getLocationStoryIdeasSystemInstruction = (): string => {
  return `You are a creative storyteller for children.
      Based on the user's location, you will generate 3-4 creative and simple story ideas for a 5-year-old child.
      The ideas should be inspired by the location's landmarks, culture, or nature.
      The ideas should be no more than 10 words each.
      Your response MUST be a valid JSON object with a single key "ideas" which is an array of strings.
      
      Example for "Paris, France":
      {
          "ideas": [
              "A pigeon's adventure on the Eiffel Tower",
              "The mouse who lived in the Louvre",
              "A magical boat ride on the Seine river"
          ]
      }`;
};

export const generateStoryAndIllustration = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { topic, storyLength } = request.data;
    if (!topic) {
        throw new HttpsError("invalid-argument", "Topic is required.");
    }

    const systemInstruction = getStoryAndPromptSystemInstruction(storyLength);

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
      const apiRequest = {
        contents: [{ parts: [{ text: `Topic: ${topic}` }] }],
        system_instruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
         },
      };

      const apiResponse = await fetch(modelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiRequest),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        logger.error("Error from Gemini API:", errorText);
        throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
      }

      const data = await apiResponse.json();

      if (
        !data.candidates ||
        data.candidates.length === 0
      ) {
        logger.warn("Story and prompt generation was blocked for safety reasons.", { topic });
        throw new HttpsError("invalid-argument", "That topic is not allowed. Please choose a friendlier topic for a children's story.");
      }

      const responseJson = JSON.parse(data.candidates[0].content.parts[0].text)
      const title = responseJson.title;
      const storyText = responseJson.story;
      const imagePrompt = responseJson.imagePrompt;
      const quiz = responseJson.quiz;


      if (!title || !storyText || !imagePrompt || !quiz) {
        logger.error("Missing title, story, image prompt, or quiz in Gemini response", data);
        throw new HttpsError("internal", "Failed to generate complete story data from AI.");
      }


      const imageModelUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/kidreads-v2/locations/us-central1/publishers/google/models/imagen-4.0-fast-generate-001:predict`;
      const accessToken = (await (await fetch("http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token", { headers: { "Metadata-Flavor": "Google" } })).json()).access_token;
      const imageApiRequest = {
        instances: [{
          prompt: imagePrompt,
          negativePrompt: "text, words, letters, writing, captions, headlines, titles, signs, numbers, fonts",
        }],
        parameters: { sampleCount: 1, aspectRatio: "16:9", mimeType: "image/jpeg" },
      };

      const imageApiResponse = await fetch(imageModelUrl, {
        method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
          },
          body: JSON.stringify(imageApiRequest),
      });

      if (!imageApiResponse.ok) {
        const errorText = await imageApiResponse.text();
        logger.error("Error from Imagen API:", { status: imageApiResponse.status, text: errorText });
        throw new HttpsError("internal", `Imagen API failed with status ${imageApiResponse.status}`);
      }

      const imageData = await imageApiResponse.json();
      const base64ImageBytes = imageData.predictions?.[0]?.bytesBase64Encoded;
      if (!base64ImageBytes) {
        logger.error("No image data found in Imagen response", imageData);
        throw new HttpsError("internal", "Failed to generate illustration.");
      }

      const imageBuffer = Buffer.from(base64ImageBytes, 'base64');
      const fileName = `illustrations/${uuidv4()}.jpeg`;
      const file = bucket.file(fileName);

      await file.save(imageBuffer, {
        metadata: {
          contentType: 'image/jpeg',
        },
      });

      await file.makePublic();
      const illustrationUrl = file.publicUrl();

      return { title, text: storyText, illustration: illustrationUrl, quiz };

    } catch (error) {
      logger.error("Error in generateStoryAndIllustration:", error);
      throw new HttpsError("internal", "Could not generate story and illustration.");
    }
  },
);

export const getPhonemesForWord = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { word } = request.data;
    if (!word) {
      throw new HttpsError("invalid-argument", "Word is required.");
    }

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
      logger.error("API_KEY not configured in environment.");
      throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
      const cleanWord = word.replace(/[.,!?]/g, "");
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

      const prompt = `
        Analyze the word: "${cleanWord}".
        Your response MUST be a valid JSON object.
        1.  Break the word down into its individual phonemes. If the word is a common abbreviation (e.g., "Dr."), use the full word ("Doctor") for the phonemes. The result should be an array of strings in a "phonemes" field.
        2.  Determine if this is a "tricky word" for a 5-year-old. A tricky word is anything that is NOT a very common sight word (e.g., 'a', 'an', 'the', 'is', 'in', 'it', 'on').
        3.  If it is a tricky word, provide a simple, one-sentence definition suitable for a 5-year-old in a "definition" field.
        4.  If it is NOT a tricky word, the "definition" field should be null.
        Example for "happy":
        { "phonemes": ["h", "a", "ppy"], "definition": "Happy is when you feel very good and are smiling." }
        Example for "the":
        { "phonemes": ["the"], "definition": null }
      `;

      const apiRequest = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          responseMimeType: "application/json",
        },
      };

      const apiResponse = await fetch(modelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiRequest),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        logger.error("Error from Gemini phoneme API:", errorText);
        throw new HttpsError("internal", `Gemini phoneme API failed with status ${apiResponse.status}`);
      }

      const data = await apiResponse.json();
      const responseJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseJsonText) {
        throw new HttpsError("internal", "Could not get phonemes for the word.");
      }

      const responseObject = JSON.parse(responseJsonText);
      return responseObject;

    } catch (error) {
      logger.error("Error in getPhonemesForWord:", error);
      throw new HttpsError("internal", "Could not get phonemes for the word.");
    }
  },
);

export const googleCloudTTS = onCall(
  {
    region: "us-central1",
  },
  async (request) => {
    const { text, voice, isWord, speakingRate } = request.data;
    if (!text) {
      throw new HttpsError("invalid-argument", "Bad Request: Missing text");
    }

    const googleVoice = voice === 'Leda'
      ? { languageCode: 'en-US', name: 'en-US-Studio-O' }
      : { languageCode: 'en-US', name: 'en-US-Studio-M' };

    const content = isWord ? `<break time="250ms"/>${text}` : text;
    const ssml = `<speak><prosody rate="${speakingRate || 1.0}">${content}</prosody></speak>`;

    try {
      const [ttsResponse] = await textToSpeechClient.synthesizeSpeech({
        input: { ssml },
        voice: googleVoice,
        audioConfig: {
          audioEncoding: "LINEAR16",
          sampleRateHertz: 24000,
        },
      });

      if (ttsResponse.audioContent) {
        const audioContent = Buffer.from(ttsResponse.audioContent).toString('base64');
        return { audioContent };
      } else {
        throw new Error("No audio data received from Google Cloud TTS API.");
      }
    } catch (error: any) {
      logger.error(`Error generating Google Cloud TTS for text "${text}":`, error.message);
      throw new HttpsError("internal", "Failed to generate audio.");
    }
  },
);

export const transcribeAudio = onCall(
  {
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    try {
      const audioBytes = request.data.audio;
      if (!audioBytes) {
        throw new HttpsError("invalid-argument", "No audio data found in request.");
      }

      const audio = { content: audioBytes };
      const config = {
        languageCode: "en-US",
        model: "latest_long",
      };
      const requestPayload = { audio, config };

      const [speechResponse] = await speechClient.recognize(requestPayload);
      const transcription = speechResponse.results
        ?.map((result: any) => result.alternatives?.[0].transcript)
        .join("\n");

      return { transcription };
    } catch (error) {
      logger.error("Error in transcribeAudio:", error);
      throw new HttpsError("internal", "Error transcribing audio.");
    }
  },
);

const cleanAndParseJson = (text: string) => {
  const cleanedText = text.replace(/^```json\s*/, "").replace(/```$/, "");
  return JSON.parse(cleanedText);
};

export const getTimedTranscript = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
    memory: "512MiB",
  },
  async (request) => {
    const { audio, text, speakingRate, duration } = request.data;
    if (!audio || !text) {
      throw new HttpsError("invalid-argument", "Audio data and story text are required.");
    }

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
      logger.error("API_KEY not configured in environment.");
      throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

      const prompt = `Given the following story text and audio that was generated with a speaking rate of ${speakingRate} and has a duration of ${duration} seconds, generate a timed transcript of the speech audio.
The output MUST be a valid JSON array where each object contains "word", "startTime", and "endTime".
The "startTime" and "endTime" should be in seconds with milliseconds (e.g., "0.260").
The words in the transcript must exactly match the words in the provided story text.

Story Text: "${text}"

Example JSON output:
[
{"word": "Barnaby", "startTime": "0.100", "endTime": "0.500"},
{"word": "the", "startTime": "0.500", "endTime": "0.750"},
{"word": "Bumblebee", "startTime": "0.750", "endTime": "1.420"}
]`;

      const apiRequest = {
        contents: [{
          parts: [
            { inline_data: { mime_type: 'audio/l16; rate=24000;', data: audio } },
            { text: prompt }
          ]
        }],
        generationConfig: {
            responseMimeType: "application/json",
        }
      };

      const apiResponse = await fetch(modelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiRequest),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        logger.error("Error from Gemini API:", errorText);
        throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
      }

       const data = await apiResponse.json();
      const transcriptText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!transcriptText) {
        throw new HttpsError("internal", "Could not get transcript for the audio.");
      }

      const transcript = cleanAndParseJson(transcriptText);
      return { transcript };
    } catch (error) {
      logger.error("Error in getTimedTranscript:", error);
      throw new HttpsError("internal", "Could not get transcript for the audio.");
    }
  }
);

export const checkWordMatch = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { transcribedWord, expectedWord } = request.data;
    if (!transcribedWord || !expectedWord) {
        throw new HttpsError("invalid-argument", "Transcribed word and expected word are required.");
    }

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
        const prompt = `Is the transcribed text "${transcribedWord}" a close phonetic match for the expected word "${expectedWord}"? The user is a child learning to read, so be lenient with pronunciation. Consider common transcription errors, like numbers for words (e.g., "2" for "to" or "8" for "ate"). Respond with only "true" or "false".`;

        const apiRequest = {
            contents: [{ parts: [{ text: prompt }] }]
        };

        const apiResponse = await fetch(modelUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiRequest),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            logger.error("Error from Gemini API:", errorText);
            throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        const matchText = data.candidates?.[0]?.content?.parts?.[0]?.text.trim().toLowerCase();

        return { isMatch: matchText === 'true' };

    } catch (error) {
        logger.error("Error in checkWordMatch:", error);
        throw new HttpsError("internal", "Could not check word match.");
    }
  }
);

export const deleteStoryImage = onDocumentDeleted("users/{userId}/stories/{storyId}", async (event) => {
    const deletedData = event.data?.data();
    if (!deletedData) {
        logger.info("No data associated with the deleted document.");
        return;
    }

    const imageUrl = deletedData.illustration;
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('https://storage.googleapis.com')) {
        logger.info("No valid illustration URL found in the deleted document.");
        return;
    }

    try {
        const url = new URL(imageUrl);
        const filePath = decodeURIComponent(url.pathname.split('/o/')[1]);

        if (filePath) {
            await bucket.file(filePath).delete();
            logger.info(`Successfully deleted image: ${filePath}`);
        }
    } catch (error) {
        logger.error(`Failed to delete image for story ${event.params.storyId}:`, error);
    }
});

export const generateStoryIdeas = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
        const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
        const prompt = `Generate 3-4 creative and simple story ideas for a 5-year-old child. The ideas should be about friendship, animals, and nature, and should be no more than 5-7 words each. Your response MUST be a valid JSON object with a single key "ideas" which is an array of strings.
        Example:
        {
            "ideas": [
                "A squirrel who lost his acorn",
                "The rainbow-colored butterfly",
                "A bear who loves to dance"
            ]
        }`;

        const apiRequest = {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
                responseMimeType: "application/json",
            },
        };

        const apiResponse = await fetch(modelUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(apiRequest),
        });

        if (!apiResponse.ok) {
            const errorText = await apiResponse.text();
            logger.error("Error from Gemini API:", errorText);
            throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
        }

        const data = await apiResponse.json();
        const ideas = JSON.parse(data.candidates[0].content.parts[0].text);

        return ideas;
    } catch (error) {
        logger.error("Error in generateStoryIdeas:", error);
        throw new HttpsError("internal", "Could not generate story ideas.");
    }
  }
);

export const generateLocationStoryIdeas = onCall(
    {
        secrets: ["API_KEY"],
        maxInstances: 10,
        region: "us-central1",
    },
    async (request) => {
        const { latitude, longitude, location: locationInput } = request.data;
        const GEMINI_API_KEY = process.env.API_KEY;

        if ((latitude == null || longitude == null) && !locationInput) {
            throw new HttpsError("invalid-argument", "Either lat/lng or a location string is required.");
        }

        let locationToUse = locationInput;

        try {
            if (!locationToUse) {
                const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GEMINI_API_KEY}`;
                const geocodeResponse = await fetch(geocodeUrl);
                if (!geocodeResponse.ok) {
                    throw new HttpsError("internal", 'Failed to fetch location from Google Geocoding API.');
                }
                const geocodeData = await geocodeResponse.json();

                if (!geocodeData.results || geocodeData.results.length === 0) {
                    throw new HttpsError("not-found", 'No location found for the given coordinates.');
                }

                const addressComponents = geocodeData.results[0].address_components;
                const locality = addressComponents.find((c: any) => c.types.includes('locality'))?.long_name;
                const adminArea = addressComponents.find((c: any) => c.types.includes('administrative_area_level_1'))?.long_name;
                const country = addressComponents.find((c: any) => c.types.includes('country'))?.long_name;

                locationToUse = [locality, adminArea, country].filter(Boolean).join(', ');
            }

            const systemInstruction = getLocationStoryIdeasSystemInstruction();
            const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
            const prompt = `Location: ${locationToUse}`;

            const apiRequest = {
                contents: [{ parts: [{ text: prompt }] }],
                system_instruction: { parts: [{ text: systemInstruction }] },
                generationConfig: {
                    responseMimeType: "application/json",
                },
            };

            const apiResponse = await fetch(modelUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(apiRequest),
            });

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                logger.error("Error from Gemini API for location ideas:", errorText);
                throw new HttpsError("internal", `Gemini API failed with status ${apiResponse.status}`);
            }

            const data = await apiResponse.json();
            const ideas = JSON.parse(data.candidates[0].content.parts[0].text);

            return { ...ideas, location: locationToUse };
        } catch (error) {
            logger.error("Error in generateLocationStoryIdeas:", error);
            throw new HttpsError("internal", "Could not generate location-based story ideas.");
        }
    }
);

export const getPlaceAutocomplete = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { input } = request.data;
    if (!input) {
      throw new HttpsError("invalid-argument", "Input is required.");
    }

    const PLACES_API_KEY = process.env.API_KEY;
    if (!PLACES_API_KEY) {
        logger.error("API_KEY not configured in environment.");
        throw new HttpsError("internal", "Internal Server Error: API key not found.");
    }

    try {
        const autocompleteUrl = 'https://places.googleapis.com/v1/places:autocomplete';
        const apiRequest = {
          input: input,
          includedPrimaryTypes: ["locality", "administrative_area_level_3", "country"],
        };

        const autocompleteResponse = await fetch(autocompleteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': PLACES_API_KEY,
          },
          body: JSON.stringify(apiRequest),
        });


        if (!autocompleteResponse.ok) {
            const errorText = await autocompleteResponse.text();
            logger.error("Error from Google Places API:", errorText);
            throw new HttpsError("internal", `Google Places API failed with status ${autocompleteResponse.status}`);
        }

        const autocompleteData = await autocompleteResponse.json();
        return autocompleteData;

    } catch (error) {
        logger.error("Error in getPlaceAutocomplete:", error);
        throw new HttpsError("internal", "Could not get place autocomplete suggestions.");
    }
  }
);

export const onSubscriptionUpdate = onDocumentWritten(
  "customers/{userId}/subscriptions/{subscriptionId}",
  async (event: FirestoreEvent<Change<DocumentSnapshot> | undefined, { userId: string; subscriptionId: string }>) => {
    const userId = event.params.userId; // This is the user whose subscription changed
    const userDocRef = adminDb.collection("users").doc(userId);
    let beforeData: DocumentSnapshot | null = null;
    let afterData: DocumentSnapshot | null = null;

    if (event.data?.before.exists) {
        beforeData = event.data.before;
    }
    if (event.data?.after.exists) {
        afterData = event.data.after;
    }

    if (!afterData && !beforeData) {
      logger.info(`Subscription ${event.params.subscriptionId} for user ${userId} event had no data.`);
      return; // Should not happen with onWritten, but good practice
    }

    const subDataAfter = afterData?.data(); // Data after the change
    const subDataBefore = beforeData?.data(); // Data before the change (if it existed)

    const isActiveAfter = subDataAfter?.status === "active" || subDataAfter?.status === "trialing";
    const roleAfter = subDataAfter?.items?.[0]?.price?.product?.metadata?.stripeRole ?? subDataAfter?.role;

    // Determine the role *before* this change, if the document existed before
    const roleBefore = subDataBefore?.items?.[0]?.price?.product?.metadata?.stripeRole ?? subDataBefore?.role;

    logger.info(`Subscription update for user ${userId}. Status: ${subDataAfter?.status}, Role Before: ${roleBefore}, Role After: ${roleAfter}`);


    // --- Scenario 1: User (potentially a student) buys a PERSONAL plan ---
    if (isActiveAfter && (roleAfter === 'max' || roleAfter === 'lite')) {
      const userDoc = await userDocRef.get();
      // Check if this user was a member of a classroom *before* this update
      if (userDoc.exists && userDoc.data()?.memberOfClassroom) {
        const teacherUid = userDoc.data()?.memberOfClassroom;
        const studentEmail = userDoc.data()?.email;

        logger.info(`User ${userId} (${studentEmail}) subscribed to '${roleAfter}' and was a student of teacher ${teacherUid}. Removing from old classroom.`);

        if (!teacherUid || !studentEmail) {
          logger.error(`Missing teacherUid or studentEmail for student ${userId} during auto-removal after upgrade.`);
          // Still try to clear the student's link
          try { await userDocRef.update({ memberOfClassroom: null }); } catch(e) { logger.error("Error clearing memberOfClassroom after upgrade", e); }
          return; // Exit after handling this scenario
        }

        const classroomDocRef = adminDb.collection("classrooms").doc(teacherUid);
        const teacherUserDocRef = adminDb.collection("users").doc(teacherUid);
        const batch = adminDb.batch(); // Use adminDb.batch()

        // 1. Remove email from classroom 'students' array
        batch.update(classroomDocRef, { students: FieldValue.arrayRemove(studentEmail), updatedAt: Timestamp.now() });
        // 2. Remove student from teacher's 'classroomUsage' map
        batch.update(teacherUserDocRef, { [`classroomUsage.students.${userId}`]: FieldValue.delete() });
        // 3. Remove classroom link from student's document
        batch.update(userDocRef, { memberOfClassroom: null });

        try {
          await batch.commit();
          logger.info(`Successfully removed student ${userId} from classroom ${teacherUid} after they upgraded their plan.`);
        } catch (commitError) {
           logger.error(`Batch commit failed removing student ${userId} from classroom ${teacherUid}:`, commitError);
           // Attempt to at least clear the student link if batch failed
           try { await userDocRef.update({ memberOfClassroom: null }); } catch(e) { logger.error("Error clearing memberOfClassroom after failed batch commit", e); }
        }
        return; // Important: Exit after handling this scenario
      }
    }

    // --- Scenario 2: Teacher subscribes/renews CLASSROOM plan ---
    if (isActiveAfter && roleAfter === "classroom") {
      const classroomDocRef = adminDb.collection("classrooms").doc(userId); // userId is the teacher's UID here
      try {
        const classroomDoc = await classroomDocRef.get();
        const userDoc = await userDocRef.get(); // Teacher's user doc
        const userData = userDoc.data();

        if (!classroomDoc.exists) {
          logger.info(`Creating classroom document for teacher ${userId}.`);
          await classroomDocRef.set({
            teacherUid: userId,
            teacherEmail: userData?.email || "Unknown",
            subscriptionStatus: subDataAfter.status,
            stripeSubscriptionId: event.params.subscriptionId,
            students: [],
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
          });
          logger.info(`Classroom document created for ${userId}.`);

          logger.info(`Updating user document ${userId} for classroom setup.`);
          await userDocRef.set({
              subscription: 'classroom',
              stripeRole: 'classroom',
              classroomUsage: {
                 teacher: { credits: 30, lastReset: Date.now() },
                 students: {}
              },
              usage: FieldValue.delete() // Remove individual usage if switching to classroom
          }, { merge: true });
           logger.info(`User document ${userId} updated for classroom role and usage.`);

        } else if (classroomDoc.data()?.subscriptionStatus !== subDataAfter.status) {
            // Classroom exists, update status (e.g., if it reactivated)
           logger.info(`Classroom for ${userId} already exists. Updating status to ${subDataAfter.status}.`);
           await classroomDocRef.update({
               subscriptionStatus: subDataAfter.status,
               stripeSubscriptionId: event.params.subscriptionId,
               updatedAt: Timestamp.now(),
           });
           await userDocRef.set({
              subscription: 'classroom',
              stripeRole: 'classroom',
              // Re-initialize classroomUsage if it was somehow cleared
              classroomUsage: classroomDoc.data()?.classroomUsage || { teacher: { credits: 30, lastReset: Date.now() }, students: {} }
           }, { merge: true });
           logger.info(`Updated classroom and user status for ${userId}.`);
        }
      } catch (error) {
        logger.error(`Error processing active classroom subscription for user ${userId}:`, error);
      }
      return; // Exit after handling this scenario
    }

    // --- Scenario 3: Teacher's CLASSROOM plan becomes INACTIVE (Cancelled, Downgraded, Failed Payment) ---
    // Check if the role *before* was 'classroom' and the subscription is *no longer* active OR the role *after* is NOT 'classroom' anymore
    if (roleBefore === "classroom" && (!isActiveAfter || roleAfter !== "classroom")) {
        const teacherUid = userId; // In this context, userId is the teacher's UID
        const classroomDocRef = adminDb.collection("classrooms").doc(teacherUid);
        const teacherUserDocRef = adminDb.collection("users").doc(teacherUid);

        logger.info(`Classroom subscription for teacher ${teacherUid} ending (Status: ${subDataAfter?.status}, New Role: ${roleAfter}). Disbanding classroom.`);

        try {
            const teacherDoc = await teacherUserDocRef.get();
            const classroomDoc = await classroomDocRef.get(); // Get classroom doc for student list if needed

            if (!teacherDoc.exists) {
                logger.error(`Teacher user document ${teacherUid} not found during classroom disbanding.`);
                return;
            }

            // ***** USE IMPORTED UserData TYPE HERE *****
            const teacherData = teacherDoc.data() as UserData;
            // Get student UIDs from the teacher's classroomUsage map
            const studentUids = teacherData.classroomUsage?.students ? Object.keys(teacherData.classroomUsage.students) : [];

            const batch = adminDb.batch(); // Use adminDb.batch()

            // 1. Update the classroom document status to inactive (or delete it)
            if (classroomDoc.exists) {
                batch.update(classroomDocRef, {
                    subscriptionStatus: subDataAfter?.status || 'inactive', // Reflect final Stripe status
                    updatedAt: Timestamp.now(),
                    // Optionally clear students array: students: []
                });
            }

            // 2. Clear classroom data on the teacher's user document
            batch.update(teacherUserDocRef, {
                classroomUsage: FieldValue.delete(), // Remove the whole map
                // Don't set subscription to 'free' yet, let useAuth handle it based on the *new* active sub (if any)
                stripeRole: roleAfter // Update to the new role if they downgraded, or null if cancelled
            });

            // 3. Update each student's document
            if (studentUids.length > 0) {
                logger.info(`Removing ${studentUids.length} students from classroom ${teacherUid}.`);
                studentUids.forEach(studentUid => {
                    const studentDocRef = adminDb.collection("users").doc(studentUid);
                    // Set memberOfClassroom to null. useAuth will handle recalculating their status.
                    batch.update(studentDocRef, { memberOfClassroom: null });
                });
            } else {
                 logger.info(`No students found in teacher ${teacherUid}'s classroomUsage to remove.`);
            }

            await batch.commit();
            logger.info(`Successfully disbanded classroom for teacher ${teacherUid}.`);

        } catch (error) {
            logger.error(`Error disbanding classroom for teacher ${teacherUid}:`, error);
        }
        return; // Exit after handling this scenario
    }

    // --- Optional Scenario 4: Handle other inactive subscriptions (Lite, Max) ---
    // If a Lite or Max subscription becomes inactive, you might want to revert the user to 'free'.
    // However, the useAuth hook likely handles this already by falling back to 'free' when no active subscription is found.
    // You could add explicit logic here if needed:
    /*
    if (!isActiveAfter && (roleBefore === 'lite' || roleBefore === 'max')) {
        logger.info(`Personal subscription '${roleBefore}' ended for user ${userId}.`);
        try {
            // Check if they might *still* be a student in a classroom
            const userDoc = await userDocRef.get();
            if (!userDoc.data()?.memberOfClassroom) {
                 await userDocRef.update({
                     subscription: 'free',
                     stripeRole: null,
                     // Reset usage? Depends on your desired behavior
                     // usage: { credits: 5, lastReset: Date.now() }
                 });
                 logger.info(`Reverted user ${userId} to 'free' tier.`);
            } else {
                 logger.info(`User ${userId} still part of a classroom, not reverting to free.`);
            }
        } catch (error) {
            logger.error(`Error updating user ${userId} after personal subscription ended:`, error);
        }
    }
    */
  }
);

const getBookReportSystemInstruction = (): string => {
  return `You are a helpful assistant for a children's reading app.
    Based on the full text of a children's story, generate a simple book report suitable for a 1st or 2nd grader.
    The report should be 3-4 sentences long and cover:
    1. The main characters.
    2. The setting.
    3. A brief summary of what happened.

    Your response MUST be a valid JSON object with a single key "report" which is a string.

    Example:
    {
      "report": "This story is about a bear named Barnaby and a bee named Buzz. They were in a sunny forest looking for honey. Barnaby and Buzz worked together to find the honey and shared it with their friends."
    }`;
};

const getEditReportSystemInstruction = (): string => {
  return `You are a helpful and encouraging editor for a young child.
    A child has recorded their own book report, and it has been transcribed.
    Your task is to edit the transcription to correct spelling, fix grammar, and improve clarity, while
    **preserving the child's original voice, ideas, and personality**.
    Do not add new facts from the story. Just polish the child's own words.
    The report is about the following story:
    --- STORY ---
    {STORY_TEXT}
    --- END STORY ---

    Your response MUST be a valid JSON object with a single key "editedReport" which is a string.

    Example Child Transcription: "i liked the story it was about a bear and a bee and they was looking for honey. and they found it"
    Example JSON response:
    {
      "editedReport": "I liked the story! It was about a bear and a bee, and they were looking for honey. In the end, they found it!"
    }`;
};

export const generateBookReport = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { storyText } = request.data;
    if (!storyText) {
      throw new HttpsError("invalid-argument", "Story text is required.");
    }

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
      logger.error("API_KEY not configured in environment.");
      throw new HttpsError(
        "internal",
        "Internal Server Error: API key not found."
      );
    }

    try {
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
      const systemInstruction = getBookReportSystemInstruction();
      const apiRequest = {
        contents: [{ parts: [{ text: `Story: ${storyText}` }] }],
        system_instruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      };

      const apiResponse = await fetch(modelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiRequest),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        logger.error("Error from Gemini API:", errorText);
        throw new HttpsError(
          "internal",
          `Gemini API failed with status ${apiResponse.status}`
        );
      }

      const data = await apiResponse.json();
      const responseJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseJsonText) {
        throw new HttpsError("internal", "Could not generate book report.");
      }

      const responseObject = JSON.parse(responseJsonText);
      return responseObject; // { "report": "..." }
    } catch (error) {
      logger.error("Error in generateBookReport:", error);
      throw new HttpsError("internal", "Could not generate book report.");
    }
  }
);

export const editBookReport = onCall(
  {
    secrets: ["API_KEY"],
    maxInstances: 10,
    region: "us-central1",
  },
  async (request) => {
    const { storyText, transcribedText } = request.data;
    if (!storyText || !transcribedText) {
      throw new HttpsError(
        "invalid-argument",
        "Story text and transcribed text are required."
      );
    }

    const GEMINI_API_KEY = process.env.API_KEY;
    if (!GEMINI_API_KEY) {
      logger.error("API_KEY not configured in environment.");
      throw new HttpsError(
        "internal",
        "Internal Server Error: API key not found."
      );
    }

    try {
      const modelUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
      let systemInstruction = getEditReportSystemInstruction();
      systemInstruction = systemInstruction.replace("{STORY_TEXT}", storyText);

      const apiRequest = {
        contents: [
          { parts: [{ text: `Child's Transcription: ${transcribedText}` }] },
        ],
        system_instruction: { parts: [{ text: systemInstruction }] },
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      };

      const apiResponse = await fetch(modelUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apiRequest),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        logger.error("Error from Gemini API:", errorText);
        throw new HttpsError(
          "internal",
          `Gemini API failed with status ${apiResponse.status}`
        );
      }

      const data = await apiResponse.json();
      const responseJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!responseJsonText) {
        throw new HttpsError("internal", "Could not edit book report.");
      }

      const responseObject = JSON.parse(responseJsonText);
      return responseObject; // { "editedReport": "..." }
    } catch (error) {
      logger.error("Error in editBookReport:", error);
      throw new HttpsError("internal", "Could not edit book report.");
    }
  }
);