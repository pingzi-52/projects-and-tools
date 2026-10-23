export type WeatherType = "sunny" | "rain" | "cloudy";

export interface WeatherState {
  type: WeatherType;
  autoWater: boolean;
}

export interface WeatherProvider {
  current(): WeatherState;
}
