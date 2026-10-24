/**
 * Built-in Hindi (Devanagari) for every preset card, so Hindi works instantly,
 * offline, and with a good human-written translation. Cards written by the
 * user, or suggested by AI without Hindi, are translated through the server
 * (see services/hindi.ts) and cached.
 *
 * Keys are the English text exactly as written in dailyScenarios.ts; lookups
 * normalise case, spacing and punctuation (see hindiKey).
 */

export const HINDI_CARDS: Record<string, string> = {
  // Emergency
  'Please help me!': 'कृपया मेरी मदद कीजिए!',
  'I need a doctor now.': 'मुझे अभी डॉक्टर चाहिए।',
  'Please call an ambulance.': 'कृपया एम्बुलेंस बुलाइए।',
  'Please call the police.': 'कृपया पुलिस को बुलाइए।',
  'I cannot hear. Please write or show me.': 'मैं सुन नहीं सकता। कृपया लिखकर या दिखाकर बताइए।',
  'I am hurt.': 'मुझे चोट लगी है।',
  'There is a fire!': 'आग लगी है!',
  'I am lost. Please help me.': 'मैं खो गया हूँ। कृपया मेरी मदद कीजिए।',
  'Please call my family.': 'कृपया मेरे परिवार को फ़ोन कीजिए।',
  'Where is the nearest hospital?': 'सबसे नज़दीकी अस्पताल कहाँ है?',
  'I am in danger.': 'मैं ख़तरे में हूँ।',
  'I cannot breathe well.': 'मुझे साँस लेने में तकलीफ़ हो रही है।',
  'Please stay with me.': 'कृपया मेरे साथ रहिए।',
  'Please write or speak slowly. I am scared.': 'कृपया धीरे लिखिए या बोलिए। मैं डरा हुआ हूँ।',
  'I need water.': 'मुझे पानी चाहिए।',

  // Healthcare
  'I need to see a doctor.': 'मुझे डॉक्टर को दिखाना है।',
  'I am in pain.': 'मुझे दर्द हो रहा है।',
  'It hurts here. Let me show you.': 'यहाँ दर्द हो रहा है। मैं आपको दिखाता हूँ।',
  'I feel dizzy.': 'मुझे चक्कर आ रहे हैं।',
  'I have a fever.': 'मुझे बुखार है।',
  'I need my medicine.': 'मुझे मेरी दवा चाहिए।',
  'Where is the pharmacy?': 'दवाई की दुकान कहाँ है?',
  'I have an allergy. Please check before giving me medicine.': 'मुझे एलर्जी है। कृपया दवा देने से पहले जाँच लीजिए।',
  'Please write it down for me.': 'कृपया मेरे लिए इसे लिख दीजिए।',
  'I did not understand. Please explain slowly.': 'मुझे समझ नहीं आया। कृपया धीरे-धीरे समझाइए।',
  'How many times a day should I take this?': 'मुझे यह दिन में कितनी बार लेना है?',
  'Is there a sign language interpreter available?': 'क्या कोई सांकेतिक भाषा का दुभाषिया उपलब्ध है?',
  'Where is the washroom?': 'शौचालय कहाँ है?',

  // Shopping / restaurant
  'How much is this?': 'यह कितने का है?',
  'I would like this one, please.': 'मुझे यह वाला चाहिए, कृपया।',
  'Can I see the menu?': 'क्या मैं मेन्यू देख सकता हूँ?',
  'I need water, please.': 'मुझे पानी चाहिए, कृपया।',
  'Please bring the bill.': 'कृपया बिल ले आइए।',
  'Is this spicy?': 'क्या यह तीखा है?',
  'I have a food allergy. Please tell me what is in this.': 'मुझे खाने से एलर्जी है। कृपया बताइए कि इसमें क्या-क्या है।',
  'I am vegetarian.': 'मैं शाकाहारी हूँ।',
  'Can I pay by UPI?': 'क्या मैं UPI से पैसे दे सकता हूँ?',
  'Do you have a smaller size?': 'क्या आपके पास इससे छोटा साइज़ है?',
  'Please write the price for me.': 'कृपया मेरे लिए कीमत लिख दीजिए।',
  'I need a bag, please.': 'मुझे एक थैला चाहिए, कृपया।',
  'Thank you.': 'धन्यवाद।',
  'Please repeat that more slowly.': 'कृपया इसे और धीरे दोहराइए।',

  // College / education
  'I use Indian Sign Language to communicate.': 'मैं बातचीत के लिए भारतीय सांकेतिक भाषा का उपयोग करता हूँ।',
  'Please face me when you speak.': 'कृपया बोलते समय मेरी ओर मुँह रखिए।',
  'Could you please repeat that?': 'क्या आप कृपया इसे दोहरा सकते हैं?',
  'Please write it on the board.': 'कृपया इसे बोर्ड पर लिख दीजिए।',
  'I did not understand. Can you explain again?': 'मुझे समझ नहीं आया। क्या आप फिर से समझा सकते हैं?',
  'May I ask a question?': 'क्या मैं एक सवाल पूछ सकता हूँ?',
  'Is an interpreter available for this class?': 'क्या इस कक्षा के लिए दुभाषिया उपलब्ध है?',
  'Can I get a copy of the notes?': 'क्या मुझे नोट्स की एक कॉपी मिल सकती है?',
  'I need a little more time, please.': 'मुझे थोड़ा और समय चाहिए, कृपया।',
  'Where is the library?': 'पुस्तकालय कहाँ है?',
  'Where is the classroom?': 'कक्षा कहाँ है?',
  'When is the exam?': 'परीक्षा कब है?',
  'Please speak slowly.': 'कृपया धीरे बोलिए।',
  'Thank you, teacher.': 'धन्यवाद, गुरुजी।',

  // Workplace
  'Good morning.': 'सुप्रभात।',
  'Could you please write that down?': 'क्या आप कृपया इसे लिख सकते हैं?',
  'I need a moment to read this.': 'मुझे इसे पढ़ने के लिए थोड़ा समय चाहिए।',
  'Can we use chat or email for this?': 'क्या हम इसके लिए चैट या ईमेल इस्तेमाल कर सकते हैं?',
  'I did not understand the task. Please explain again.': 'मुझे काम समझ नहीं आया। कृपया फिर से समझाइए।',
  'Is there a meeting today?': 'क्या आज कोई मीटिंग है?',
  'Please share the agenda in writing.': 'कृपया एजेंडा लिखकर साझा कीजिए।',
  'I will send it to you by email.': 'मैं इसे आपको ईमेल से भेज दूँगा।',
  'Could we speak one at a time, please?': 'क्या हम एक-एक करके बोल सकते हैं, कृपया?',
  'I would like an interpreter for this meeting.': 'मुझे इस मीटिंग के लिए दुभाषिया चाहिए।',
  'Please type what you are saying.': 'आप जो कह रहे हैं, कृपया उसे टाइप कर दीजिए।',
  'I have finished the task.': 'मैंने काम पूरा कर लिया है।',
  'Thank you for your help.': 'आपकी मदद के लिए धन्यवाद।',
  'Can we continue this later?': 'क्या हम इसे बाद में जारी रख सकते हैं?',

  // Travel
  'Where is the railway station?': 'रेलवे स्टेशन कहाँ है?',
  'Where is the bus stop?': 'बस स्टॉप कहाँ है?',
  'How much is the ticket?': 'टिकट कितने का है?',
  'Which platform is it?': 'यह कौन सा प्लेटफ़ॉर्म है?',
  'Is this the right bus?': 'क्या यह सही बस है?',
  'What time does it leave?': 'यह कितने बजे चलेगी?',
  'Please write the address for me.': 'कृपया मेरे लिए पता लिख दीजिए।',
  'Can you show me on the map?': 'क्या आप मुझे नक्शे पर दिखा सकते हैं?',
  'I need a taxi, please.': 'मुझे टैक्सी चाहिए, कृपया।',
  'Please tell me when we reach this stop.': 'कृपया बताइए जब हम इस स्टॉप पर पहुँचें।',
  'Where can I buy a ticket?': 'मैं टिकट कहाँ से ले सकता हूँ?',

  // Everyday
  'Hello.': 'नमस्ते।',
  'How are you?': 'आप कैसे हैं?',
  'I am fine, thank you.': 'मैं ठीक हूँ, धन्यवाद।',
  'Please.': 'कृपया।',
  'Sorry.': 'माफ़ कीजिए।',
  'Yes.': 'हाँ।',
  'No.': 'नहीं।',
  'I do not understand.': 'मुझे समझ नहीं आया।',
  'Please repeat that.': 'कृपया दोहराइए।',
  'Please write it down.': 'कृपया लिख दीजिए।',
  'I use Indian Sign Language.': 'मैं भारतीय सांकेतिक भाषा का उपयोग करता हूँ।',
  'What is your name?': 'आपका नाम क्या है?',
  'Please wait a moment.': 'कृपया थोड़ी देर रुकिए।',
  'Please help me.': 'कृपया मेरी मदद कीजिए।',

  // Built-in "more suggestions" (used when AI is not available)
  'I have been feeling unwell since yesterday.': 'मुझे कल से तबीयत ठीक नहीं लग रही है।',
  'Can you show me where to go?': 'क्या आप मुझे बता सकते हैं कि कहाँ जाना है?',
  'I need to rest.': 'मुझे आराम करना है।',
  'Is this medicine safe with my other medicines?': 'क्या यह दवा मेरी दूसरी दवाओं के साथ सुरक्षित है?',
  'Please call the nurse.': 'कृपया नर्स को बुलाइए।',
  'When will the doctor see me?': 'डॉक्टर मुझे कब देखेंगे?',
  'Where do I pay?': 'मैं पैसे कहाँ दूँ?',
  'Please bring me some water.': 'कृपया मेरे लिए थोड़ा पानी ले आइए।',
  'Can I have a written prescription?': 'क्या मुझे लिखा हुआ पर्चा मिल सकता है?',
  'I would like a second opinion.': 'मैं दूसरी राय लेना चाहता हूँ।',
  'Do you have this in another colour?': 'क्या यह दूसरे रंग में है?',
  'Can I try this on?': 'क्या मैं इसे पहनकर देख सकता हूँ?',
  'Is there a discount?': 'क्या कुछ छूट मिलेगी?',
  'Please pack this for me.': 'कृपया इसे पैक कर दीजिए।',
  'I would like to order this.': 'मैं यह ऑर्डर करना चाहता हूँ।',
  'Can I get a receipt?': 'क्या मुझे रसीद मिल सकती है?',
  'Is this fresh?': 'क्या यह ताज़ा है?',
  'Please show me the price on your phone.': 'कृपया अपने फ़ोन पर कीमत दिखा दीजिए।',
  'I am ready to pay.': 'मैं पैसे देने के लिए तैयार हूँ।',
  'Where is the counter?': 'काउंटर कहाँ है?',
  'Could you share the slides with me?': 'क्या आप मुझे स्लाइड्स भेज सकते हैं?',
  'I missed the last class. Can you help me catch up?': 'मेरी पिछली कक्षा छूट गई थी। क्या आप मुझे पढ़ाई पूरी करने में मदद कर सकते हैं?',
  'Please give the instructions in writing.': 'कृपया निर्देश लिखकर दीजिए।',
  'May I sit near the front?': 'क्या मैं आगे बैठ सकता हूँ?',
  'Can we meet after class?': 'क्या हम कक्षा के बाद मिल सकते हैं?',
  'Where is the office?': 'दफ़्तर कहाँ है?',
  'Which room is the exam in?': 'परीक्षा किस कमरे में है?',
  'Can I submit this by email?': 'क्या मैं इसे ईमेल से जमा कर सकता हूँ?',
  'I would like to join the group.': 'मैं समूह में शामिल होना चाहता हूँ।',
  'Thank you for explaining.': 'समझाने के लिए धन्यवाद।',
  'Could you send the details by email?': 'क्या आप जानकारी ईमेल से भेज सकते हैं?',
  'Please add captions or notes for the meeting.': 'कृपया मीटिंग के लिए कैप्शन या नोट्स जोड़ दीजिए।',
  'I will update you by the end of the day.': 'मैं दिन के अंत तक आपको बता दूँगा।',
  'Can you point me to the right person?': 'क्या आप मुझे सही व्यक्ति के पास भेज सकते हैं?',
  'May I take a short break?': 'क्या मैं थोड़ी देर का ब्रेक ले सकता हूँ?',
  'Please share the minutes of the meeting.': 'कृपया मीटिंग का ब्योरा साझा कीजिए।',
  'I am ready to start.': 'मैं शुरू करने के लिए तैयार हूँ।',
  'Could we sit where I can see everyone?': 'क्या हम ऐसी जगह बैठ सकते हैं जहाँ से मैं सबको देख सकूँ?',
  'I will check and let you know.': 'मैं देखकर आपको बता दूँगा।',
  'That works for me.': 'मेरे लिए यह ठीक है।',
  'Is there a direct train?': 'क्या सीधी ट्रेन है?',
  'How long will it take?': 'इसमें कितना समय लगेगा?',
  'Which exit should I take?': 'मुझे किस निकास से जाना चाहिए?',
  'Can I get a seat here?': 'क्या मुझे यहाँ सीट मिल सकती है?',
  'Is this the correct platform?': 'क्या यह सही प्लेटफ़ॉर्म है?',
  'Please tell me the next stop in writing.': 'कृपया अगला स्टॉप लिखकर बताइए।',
  'Where is the ticket counter?': 'टिकट काउंटर कहाँ है?',
  'Where can I find a hotel nearby?': 'आस-पास होटल कहाँ मिलेगा?',
  'Please stop here.': 'कृपया यहीं रोक दीजिए।',
  'Can I get a refund for this ticket?': 'क्या इस टिकट का पैसा वापस मिल सकता है?',
  'Good evening.': 'शुभ संध्या।',
  'Nice to meet you.': 'आपसे मिलकर अच्छा लगा।',
  'See you later.': 'फिर मिलते हैं।',
  'Can you help me, please?': 'क्या आप मेरी मदद कर सकते हैं, कृपया?',
  'Could you type that on your phone?': 'क्या आप इसे अपने फ़ोन पर टाइप कर सकते हैं?',
  'I am learning to communicate with you.': 'मैं आपसे बात करना सीख रहा हूँ।',
  'That is okay.': 'कोई बात नहीं।',
  'Let me think for a moment.': 'मुझे एक पल सोचने दीजिए।',
  'Excuse me.': 'सुनिए, माफ़ कीजिए।',
  'Please stay calm and write what happened.': 'कृपया शांत रहिए और जो हुआ वह लिखकर बताइए।',
  'I need help right now.': 'मुझे अभी मदद चाहिए।',
  'Please take me to a safe place.': 'कृपया मुझे किसी सुरक्षित जगह ले चलिए।',
  'Please call someone who can sign.': 'कृपया किसी ऐसे व्यक्ति को बुलाइए जो सांकेतिक भाषा जानता हो।',
  'I am not able to hear you.': 'मैं आपको सुन नहीं पा रहा हूँ।',
  'Is anyone here a doctor?': 'क्या यहाँ कोई डॉक्टर है?',
  'I need to sit down.': 'मुझे बैठना है।',
  'Please call my emergency contact.': 'कृपया मेरे आपातकालीन संपर्क को फ़ोन कीजिए।',
  'Please tell me what is happening.': 'कृपया बताइए कि क्या हो रहा है।',
  'I need a hospital.': 'मुझे अस्पताल जाना है।',
};

/** Same normalisation as the duplicate check: ignores case, spacing and punctuation. */
export function hindiKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const BY_KEY: Map<string, string> = new Map(
  Object.entries(HINDI_CARDS).map(([en, hi]) => [hindiKey(en), hi])
);

/** Built-in Hindi for a card, or undefined when there is none. */
export function builtInHindi(text: string): string | undefined {
  return BY_KEY.get(hindiKey(text));
}
