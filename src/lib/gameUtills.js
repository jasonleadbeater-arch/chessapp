import { supabase } from "./supabase";

export const awardSenetPrize = async (userId, difficulty) => {
  const prize = difficulty === "Pharaoh" ? 20 : 5; // Higher stakes for harder AI
  
  const { data, error } = await supabase
    .from('profiles')
    .rpc('increment_coins', { x: prize, row_id: userId });

  if (error) console.error("Treasury Error:", error);
  return data;
};
